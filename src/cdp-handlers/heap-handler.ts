import { Page } from 'puppeteer';
import {
  HeapSnapshot,
  MemoryAnalysis,
  AllocationTracking,
  AllocationTrackingSummary,
  AllocationTrackingTopStack,
  GetHeapSnapshotParams,
  AnalyzeMemoryParams,
  TrackAllocationsParams,
} from '../types.js';
import { BrowserManager } from '../browser-manager.js';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * 内存堆栈分析器
 */
export class HeapHandler {
  private browserManager: BrowserManager;
  private snapshots: Map<string, HeapSnapshot[]> = new Map();
  private allocationTracking: Map<string, AllocationTracking> = new Map();

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }

  /**
   * 获取堆快照
   */
  public async getHeapSnapshot(
    params: GetHeapSnapshotParams
  ): Promise<HeapSnapshot> {
    const page = await this.browserManager.getPage(params.url);
    const client = await page.target().createCDPSession();

    try {
      const topN = params.topN ?? 20;
      const exportMode = params.export?.mode ?? 'none';
      const maxInlineBytes = params.export?.maxInlineBytes ?? 64 * 1024; // 64KB
      const maxSnapshotBytes = params.maxSnapshotBytes ?? 200 * 1024 * 1024; // 200MB
      const maxParseBytes = params.maxParseBytes ?? 50 * 1024 * 1024; // 50MB

      const limitations: string[] = [];
      const shouldReturnFile = exportMode === 'file' || exportMode === 'both';

      // 启用 HeapProfiler
      await client.send('HeapProfiler.enable');
      await client.send('Runtime.enable').catch(() => {
        // ignore
      });

      if (params.collectGarbage) {
        await client.send('HeapProfiler.collectGarbage').catch(() => {
          // ignore if unsupported
        });
      }

      // 获取 runtime heap usage（CDP）
      const runtimeHeapUsage = await client
        .send('Runtime.getHeapUsage')
        .catch(() => null as any);

      // 获取堆统计信息（performance.memory）
      const heapStats = await page.evaluate(() => {
        if ((performance as any).memory) {
          const memory = (performance as any).memory;
          return {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          };
        }
        return null;
      });

      const capture = await this.captureHeapSnapshotRaw({
        client,
        exportMode,
        exportFilePath: params.export?.filePath,
        maxInlineBytes,
        maxSnapshotBytes,
        fileNamePrefix: 'heap',
        limitations,
      });

      const { snapshotFilePath, isTempFile, fileBytesWritten, snapshotTruncated, streamError, exportInfo } =
        capture;

      // 解析（如果未截断且体积可控）
      let parsed = false;
      let totalNodes: number | undefined;
      let totalSizeBytes: number | undefined;
      let topConstructors: any[] | undefined;
      let topNodes: any[] | undefined;

      try {
        if (streamError) {
          // 写入失败时，跳过解析
          throw streamError;
        }
        const st = await stat(snapshotFilePath).catch(() => null);
        const fileSize = st?.size ?? fileBytesWritten;

        if (snapshotTruncated) {
          // 已在 limitations 记录
        } else if (fileSize > maxParseBytes) {
          limitations.push(
            `raw heap snapshot size (${fileSize}) exceeded maxParseBytes (${maxParseBytes}); parsing skipped`
          );
        } else {
          const raw = await readFile(snapshotFilePath, 'utf8');
          const parsedResult = this.parseV8HeapSnapshot(raw, topN);
          parsed = true;
          totalNodes = parsedResult.totalNodes;
          totalSizeBytes = parsedResult.totalSizeBytes;
          topConstructors = parsedResult.topConstructors;
          topNodes = parsedResult.topNodes;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        limitations.push(`failed to parse heap snapshot: ${msg}`);
      } finally {
        // 如果不对外导出 file，则删除临时文件
        if (!shouldReturnFile && isTempFile) {
          await rm(snapshotFilePath, { force: true }).catch(() => {
            // ignore
          });
        }
      }

      /**
       * ===== 兼容字段（deprecated）说明 =====
       *
       * 历史版本的 `get_heap_snapshot` 返回结构是：
       * - nodes / totalSize / totalNodes / timestamp
       *
       * 现在我们已经升级为 new shape：
       * - timestamp / summary / export / limitations
       *
       * 为了避免频繁 major（并给调用方迁移窗口），这里暂时继续返回旧字段：
       * - `totalSize` -> 优先使用 `summary.totalSizeBytes`，否则回退到 `performance.memory.usedJSHeapSize` / `Runtime.getHeapUsage.usedSize`
       * - `totalNodes` -> `summary.totalNodes`（解析失败则为 0）
       * - `nodes` -> 仅返回 TopN 节点（来自 `summary.topNodes`），避免把全量节点塞进 MCP 响应导致体积过大
       *
       * 计划：下个 major 版本移除这些兼容字段（详见 TODO.md 与 README.md 迁移说明）。
       */
      const legacyTotalSize =
        totalSizeBytes ??
        heapStats?.usedJSHeapSize ??
        runtimeHeapUsage?.usedSize ??
        0;

      const legacyTotalNodes = totalNodes ?? 0;

      const legacyNodes: NonNullable<HeapSnapshot['nodes']> = (topNodes ?? []).map(
        (n, i) => ({
          id: typeof n.id === 'number' ? n.id : i,
          name: n.name,
          type: n.type ?? 'unknown',
          size: n.selfSizeBytes,
        })
      );

      if (typeof totalNodes === 'number' && totalNodes > legacyNodes.length) {
        limitations.push(
          `兼容字段 nodes 已截断：仅返回 TopN（${legacyNodes.length}/${totalNodes}）。请使用 summary.topNodes / export.filePath 获取更完整信息。`
        );
      }

      return {
        timestamp: Date.now(),
        summary: {
          parsed,
          totalNodes,
          totalSizeBytes,
          topConstructors,
          topNodes,
          jsHeapUsedBytes: heapStats?.usedJSHeapSize,
          jsHeapTotalBytes: heapStats?.totalJSHeapSize,
          jsHeapSizeLimitBytes: heapStats?.jsHeapSizeLimit,
          runtimeUsedSizeBytes: runtimeHeapUsage?.usedSize,
          runtimeTotalSizeBytes: runtimeHeapUsage?.totalSize,
        },
        export: exportInfo,
        limitations: limitations.length ? limitations : undefined,

        // ===== deprecated legacy fields（下个 major 移除）=====
        // 兼容旧返回：nodes/totalSize/totalNodes
        nodes: legacyNodes,
        totalSize: legacyTotalSize,
        totalNodes: legacyTotalNodes,
      };
    } finally {
      // 确保 CDP 连接被正确关闭
      try {
        await client.detach();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }

  /**
   * 分析内存使用情况
   */
  public async analyzeMemory(
    params: AnalyzeMemoryParams
  ): Promise<MemoryAnalysis> {
    const page = await this.browserManager.getPage(params.url);
    const client = await page.target().createCDPSession();

    try {
      // 启用 Runtime 和 HeapProfiler
      await client.send('Runtime.enable');
      await client.send('HeapProfiler.enable');

      // 获取堆使用情况
      const heapUsage = await page.evaluate(() => {
        if ((performance as any).memory) {
          const memory = (performance as any).memory;
          return {
            heapUsed: memory.usedJSHeapSize,
            heapTotal: memory.totalJSHeapSize,
            external: 0,
            rss: 0,
          };
        }
        return {
          heapUsed: 0,
          heapTotal: 0,
          external: 0,
          rss: 0,
        };
      });

      // 获取对象统计（通过采样）
      const objectCounts = await this.getObjectCounts(client);

      return {
        ...heapUsage,
        timestamp: Date.now(),
        objectCounts,
      };
    } finally {
      // 确保 CDP 连接被正确关闭
      try {
        await client.detach();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }

  /**
   * 跟踪对象分配
   */
  public async trackAllocations(
    params: TrackAllocationsParams
  ): Promise<AllocationTracking> {
    const page = await this.browserManager.getPage(params.url);
    const client = await page.target().createCDPSession();
    const pageUrl = page.url();

    try {
      const now = Date.now();
      const durationMs = params.duration ?? 5000;
      const topN = params.topN ?? 20;
      const exportMode = params.export?.mode ?? 'none';
      const maxInlineBytes = params.export?.maxInlineBytes ?? 64 * 1024; // 64KB
      const maxSnapshotBytes = params.maxSnapshotBytes ?? 200 * 1024 * 1024; // 200MB
      const maxParseBytes = params.maxParseBytes ?? 50 * 1024 * 1024; // 50MB

      const limitations: string[] = [];
      const shouldReturnFile = exportMode === 'file' || exportMode === 'both';

      // 启用 HeapProfiler
      await client.send('HeapProfiler.enable');

      if (params.collectGarbage) {
        await client.send('HeapProfiler.collectGarbage').catch(() => {
          // ignore if unsupported
        });
      }

      const beforeUsedBytes = await this.getPerformanceMemoryUsedBytes(page);

      // 开始跟踪分配（启用 allocation tracking）
      await client.send('HeapProfiler.startTrackingHeapObjects', {
        trackAllocations: true,
      });

      // 等待指定时间
      await new Promise((resolve) => setTimeout(resolve, durationMs));

      // 采集“带 trace 的 heap snapshot”（作为 raw allocation profile）
      const capture = await this.captureHeapSnapshotRaw({
        client,
        exportMode,
        exportFilePath: params.export?.filePath,
        maxInlineBytes,
        maxSnapshotBytes,
        fileNamePrefix: 'alloc',
        limitations,
      });

      // 停止跟踪
      await client.send('HeapProfiler.stopTrackingHeapObjects', {
        reportProgress: false,
      });

      const { snapshotFilePath, isTempFile, fileBytesWritten, snapshotTruncated, streamError, exportInfo } =
        capture;

      const afterUsedBytes = await this.getPerformanceMemoryUsedBytes(page);
      const approxAllocatedBytes =
        typeof beforeUsedBytes === 'number' && typeof afterUsedBytes === 'number'
          ? Math.max(0, afterUsedBytes - beforeUsedBytes)
          : 0;

      let summary: AllocationTrackingSummary | undefined;

      try {
        if (streamError) {
          throw streamError;
        }
        const st = await stat(snapshotFilePath).catch(() => null);
        const fileSize = st?.size ?? fileBytesWritten;

        if (snapshotTruncated) {
          // 已在 limitations 记录
        } else if (fileSize > maxParseBytes) {
          limitations.push(
            `raw allocation profile size (${fileSize}) exceeded maxParseBytes (${maxParseBytes}); parsing skipped`
          );
        } else {
          const raw = await readFile(snapshotFilePath, 'utf8');
          const parsedTrace = this.parseV8HeapSnapshotAllocationTrace(raw, topN);
          summary = parsedTrace;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        limitations.push(`failed to parse allocation profile: ${msg}`);
        summary = { parsed: false };
      } finally {
        // 如果不对外导出 file，则删除临时文件
        if (!shouldReturnFile && isTempFile) {
          await rm(snapshotFilePath, { force: true }).catch(() => {
            // ignore
          });
        }
      }

      const topStacks = summary?.topStacks ?? [];
      const legacyTimestamp = now;
      const allocations: AllocationTracking['allocations'] = topStacks.map((s) => ({
        size: s.sizeBytes,
        timestamp: legacyTimestamp,
        stackTrace: s.stackTrace,
      }));

      const totalAllocated =
        summary?.totalAllocatedBytes ?? (approxAllocatedBytes > 0 ? approxAllocatedBytes : 0);
      const count = summary?.totalCount ?? (allocations.length > 0 ? allocations.length : 0);

      const tracking: AllocationTracking = {
        timestamp: now,
        durationMs,
        summary,
        export: exportInfo,
        limitations: limitations.length ? limitations : undefined,

        // legacy fields（暂时保留）
        allocations,
        totalAllocated,
        count,
      };

      this.allocationTracking.set(pageUrl, tracking);
      return tracking;
    } finally {
      // 确保 CDP 连接被正确关闭
      try {
        await client.detach();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }

  /**
   * 检测内存泄漏（对比多次快照）
   */
  public async detectMemoryLeak(
    url: string,
    snapshotCount: number = 3,
    interval: number = 5000
  ): Promise<{
    leakDetected: boolean;
    growthRate: number;
    snapshots: HeapSnapshot[];
  }> {
    const snapshots: HeapSnapshot[] = [];

    for (let i = 0; i < snapshotCount; i++) {
      const snapshot = await this.getHeapSnapshot({ url });
      snapshots.push(snapshot);

      if (i < snapshotCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    // 计算增长率
    const sizes = snapshots.map((s) => {
      // 优先使用解析出的 totalSizeBytes；否则回退到 performance.memory.usedJSHeapSize
      return (
        s.summary.totalSizeBytes ??
        s.summary.jsHeapUsedBytes ??
        s.summary.runtimeUsedSizeBytes ??
        0
      );
    });
    const growthRate =
      sizes.length > 1
        ? sizes[0] > 0
          ? ((sizes[sizes.length - 1] - sizes[0]) / sizes[0]) * 100
          : 0
        : 0;

    // 如果增长率超过 10%，认为可能存在内存泄漏
    const leakDetected = growthRate > 10;

    return {
      leakDetected,
      growthRate,
      snapshots,
    };
  }

  /**
   * 获取对象计数（采样）
   */
  private async getObjectCounts(
    client: any
  ): Promise<Record<string, number>> {
    try {
      // 获取堆对象统计
      const result = await client.send('HeapProfiler.getHeapObjectId', {
        objectId: '1',
      });

      // 这里需要更复杂的实现来统计对象
      // 简化版本返回空对象
      return {};
    } catch {
      return {};
    }
  }

  /**
   * 清除快照历史
   */
  public clearSnapshots(url?: string): void {
    if (url) {
      this.snapshots.delete(url);
    } else {
      this.snapshots.clear();
    }
  }

  /**
   * 解析 V8 heap snapshot JSON，生成摘要
   */
  private parseV8HeapSnapshot(
    rawJson: string,
    topN: number
  ): {
    totalNodes: number;
    totalSizeBytes: number;
    topConstructors: Array<{ name: string; count: number; selfSizeBytes: number }>;
    topNodes: Array<{ id?: number; name: string; type?: string; selfSizeBytes: number }>;
  } {
    const data = JSON.parse(rawJson);
    const snapshot = data?.snapshot;
    const meta = snapshot?.meta;
    const nodesArr: number[] = data?.nodes;
    const strings: string[] = data?.strings;

    if (!meta || !Array.isArray(nodesArr) || !Array.isArray(strings)) {
      throw new Error('invalid heap snapshot structure');
    }

    const nodeFields: string[] = meta.node_fields;
    const nodeTypes: any[] = meta.node_types;
    const fieldCount = nodeFields.length;

    const idxType = nodeFields.indexOf('type');
    const idxName = nodeFields.indexOf('name');
    const idxId = nodeFields.indexOf('id');
    const idxSelfSize = nodeFields.indexOf('self_size');

    if (idxType < 0 || idxName < 0 || idxSelfSize < 0) {
      throw new Error('heap snapshot meta missing required node_fields');
    }

    const typeEnum: string[] | undefined = Array.isArray(nodeTypes?.[idxType])
      ? (nodeTypes[idxType] as string[])
      : undefined;

    const nodeCount =
      typeof snapshot?.node_count === 'number'
        ? snapshot.node_count
        : Math.floor(nodesArr.length / fieldCount);

    let totalSizeBytes = 0;
    const byName: Map<string, { count: number; selfSizeBytes: number }> = new Map();

    // 用小顶堆/排序都行，这里直接收集后排序（topN 默认为 20，性能足够）
    const nodeList: Array<{ id?: number; name: string; type?: string; selfSizeBytes: number }> = [];

    for (let i = 0; i < nodeCount; i++) {
      const base = i * fieldCount;
      const nameIndex = nodesArr[base + idxName];
      const name = strings[nameIndex] ?? String(nameIndex);

      const selfSize = nodesArr[base + idxSelfSize] ?? 0;
      totalSizeBytes += selfSize;

      const typeValue = nodesArr[base + idxType];
      const type = typeEnum ? typeEnum[typeValue] : String(typeValue);

      const id = idxId >= 0 ? nodesArr[base + idxId] : undefined;

      const agg = byName.get(name) ?? { count: 0, selfSizeBytes: 0 };
      agg.count += 1;
      agg.selfSizeBytes += selfSize;
      byName.set(name, agg);

      nodeList.push({ id, name, type, selfSizeBytes: selfSize });
    }

    const topConstructors = Array.from(byName.entries())
      .map(([name, v]) => ({ name, count: v.count, selfSizeBytes: v.selfSizeBytes }))
      .sort((a, b) => b.selfSizeBytes - a.selfSizeBytes)
      .slice(0, topN);

    const topNodes = nodeList
      .sort((a, b) => b.selfSizeBytes - a.selfSizeBytes)
      .slice(0, topN);

    return {
      totalNodes: nodeCount,
      totalSizeBytes,
      topConstructors,
      topNodes,
    };
  }

  private parseV8HeapSnapshotAllocationTrace(
    rawJson: string,
    topN: number
  ): AllocationTrackingSummary {
    const data = JSON.parse(rawJson) as unknown;
    if (!data || typeof data !== 'object') {
      throw new Error('invalid heap snapshot structure');
    }

    const record = data as Record<string, unknown>;
    const snapshot = record['snapshot'] as Record<string, unknown> | undefined;
    const meta = snapshot?.['meta'] as Record<string, unknown> | undefined;

    const strings = record['strings'];
    const traceTree = record['trace_tree'];
    const traceFunctionInfos = record['trace_function_infos'];

    if (
      !meta ||
      !Array.isArray(strings) ||
      !Array.isArray(traceTree) ||
      !Array.isArray(traceFunctionInfos)
    ) {
      throw new Error('heap snapshot missing trace_tree/trace_function_infos');
    }

    const traceNodeFields = meta['trace_node_fields'];
    const traceFunctionInfoFields = meta['trace_function_info_fields'];

    if (!Array.isArray(traceNodeFields) || !Array.isArray(traceFunctionInfoFields)) {
      throw new Error('heap snapshot meta missing trace_node_fields/trace_function_info_fields');
    }

    const nodeFields = traceNodeFields.map(String);
    const fnFields = traceFunctionInfoFields.map(String);

    const nodeFieldCount = nodeFields.length;
    const fnFieldCount = fnFields.length;

    if (nodeFieldCount <= 0 || fnFieldCount <= 0) {
      throw new Error('invalid trace meta field count');
    }

    const idxFnInfo =
      nodeFields.indexOf('function_info_index') >= 0
        ? nodeFields.indexOf('function_info_index')
        : nodeFields.indexOf('functionInfoIndex');
    const idxCount = nodeFields.indexOf('count');
    const idxSize = nodeFields.indexOf('size') >= 0 ? nodeFields.indexOf('size') : nodeFields.indexOf('size_bytes');
    const idxChildren =
      nodeFields.indexOf('children') >= 0
        ? nodeFields.indexOf('children')
        : nodeFields.indexOf('children_count') >= 0
          ? nodeFields.indexOf('children_count')
          : nodeFields.indexOf('childrenCount');

    if (idxFnInfo < 0 || idxCount < 0 || idxSize < 0) {
      throw new Error('trace_node_fields missing required fields');
    }

    const fnIdxName = fnFields.indexOf('name');
    const fnIdxScriptName =
      fnFields.indexOf('script_name') >= 0
        ? fnFields.indexOf('script_name')
        : fnFields.indexOf('scriptName');
    const fnIdxLine = fnFields.indexOf('line');
    const fnIdxColumn = fnFields.indexOf('column');

    const stringTable = strings.map(String);
    const fnInfoRaw = traceFunctionInfos.map((n) => Number(n));
    const traceArr = traceTree.map((n) => Number(n));

    const getFnLabel = (functionInfoIndex: number): string => {
      if (functionInfoIndex < 0) return `fn#${functionInfoIndex}`;
      const base = functionInfoIndex * fnFieldCount;
      if (base + fnFieldCount > fnInfoRaw.length) return `fn#${functionInfoIndex}`;

      const nameIndex = fnIdxName >= 0 ? fnInfoRaw[base + fnIdxName] : undefined;
      const scriptNameIndex = fnIdxScriptName >= 0 ? fnInfoRaw[base + fnIdxScriptName] : undefined;
      const line = fnIdxLine >= 0 ? fnInfoRaw[base + fnIdxLine] : undefined;
      const column = fnIdxColumn >= 0 ? fnInfoRaw[base + fnIdxColumn] : undefined;

      const name =
        typeof nameIndex === 'number' ? (stringTable[nameIndex] ?? `fn#${functionInfoIndex}`) : `fn#${functionInfoIndex}`;
      const scriptName =
        typeof scriptNameIndex === 'number' ? (stringTable[scriptNameIndex] ?? undefined) : undefined;

      if (scriptName) {
        const lineText = typeof line === 'number' ? line : 0;
        const colText = typeof column === 'number' ? column : 0;
        return `${name} (${scriptName}:${lineText}:${colText})`;
      }
      return name;
    };

    const top: AllocationTrackingTopStack[] = [];
    const pushTop = (item: AllocationTrackingTopStack) => {
      if (topN <= 0) return;
      if (top.length < topN) {
        top.push(item);
        top.sort((a, b) => a.sizeBytes - b.sizeBytes);
        return;
      }
      if (item.sizeBytes <= top[0].sizeBytes) return;
      top[0] = item;
      top.sort((a, b) => a.sizeBytes - b.sizeBytes);
    };

    let cursor = 0;
    const callStack: string[] = [];
    const childStack: Array<number> = [];

    const readNode = (): { fnLabel: string; count: number; sizeBytes: number; children: number } => {
      if (cursor + nodeFieldCount > traceArr.length) {
        throw new Error('trace_tree truncated');
      }
      const base = cursor;
      cursor += nodeFieldCount;

      const fnInfoIndex = traceArr[base + idxFnInfo] ?? 0;
      const count = traceArr[base + idxCount] ?? 0;
      const sizeBytes = traceArr[base + idxSize] ?? 0;

      const children =
        idxChildren >= 0
          ? (traceArr[base + idxChildren] ?? 0)
          : (traceArr[base + (nodeFieldCount - 1)] ?? 0);

      return {
        fnLabel: getFnLabel(fnInfoIndex),
        count: Number(count) || 0,
        sizeBytes: Number(sizeBytes) || 0,
        children: Number(children) || 0,
      };
    };

    // root node
    const root = readNode();
    callStack.push(root.fnLabel);
    childStack.push(root.children);

    const totalAllocatedBytes = root.sizeBytes;
    const totalCount = root.count;

    // 深度优先遍历：仅记录 leaf stacks（完整调用栈）
    while (childStack.length > 0) {
      const remaining = childStack[childStack.length - 1] ?? 0;
      if (remaining <= 0) {
        childStack.pop();
        callStack.pop();
        if (childStack.length > 0) {
          childStack[childStack.length - 1] = (childStack[childStack.length - 1] ?? 0) - 1;
        }
        continue;
      }

      const node = readNode();
      callStack.push(node.fnLabel);
      childStack.push(node.children);

      const isLeaf = node.children <= 0;
      const isRoot = callStack.length <= 1;

      if (!isRoot && isLeaf && node.sizeBytes > 0) {
        const stackTrace = callStack.slice(1); // drop root
        pushTop({ stackTrace, sizeBytes: node.sizeBytes, count: node.count });
      }
    }

    const topStacks = top.sort((a, b) => b.sizeBytes - a.sizeBytes);

    return {
      parsed: true,
      totalAllocatedBytes: totalAllocatedBytes > 0 ? totalAllocatedBytes : undefined,
      totalCount: totalCount > 0 ? totalCount : undefined,
      topStacks: topStacks.length ? topStacks : undefined,
    };
  }

  private async getPerformanceMemoryUsedBytes(page: Page): Promise<number> {
    const used = await page.evaluate(() => {
      if ((performance as any).memory) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });

    return typeof used === 'number' ? used : 0;
  }

  private async captureHeapSnapshotRaw(params: {
    client: unknown;
    exportMode: 'none' | 'file' | 'inline' | 'both';
    exportFilePath?: string;
    maxInlineBytes: number;
    maxSnapshotBytes: number;
    fileNamePrefix: string;
    limitations: string[];
  }): Promise<{
    snapshotFilePath: string;
    isTempFile: boolean;
    fileBytesWritten: number;
    snapshotTruncated: boolean;
    streamError: Error | null;
    exportInfo: HeapSnapshot['export'];
  }> {
    const shouldReturnFile = params.exportMode === 'file' || params.exportMode === 'both';
    const shouldReturnInline = params.exportMode === 'inline' || params.exportMode === 'both';

    const defaultSnapshotPath = join(
      '.',
      '.heapsnapshot',
      `${params.fileNamePrefix}-${Date.now()}-${randomUUID()}.heapsnapshot`
    );
    const tempSnapshotPath = join(
      tmpdir(),
      `mcp-${params.fileNamePrefix}-${Date.now()}-${randomUUID()}.heapsnapshot`
    );

    const snapshotFilePath = shouldReturnFile
      ? (params.exportFilePath ?? defaultSnapshotPath)
      : tempSnapshotPath;

    const isTempFile = !shouldReturnFile;

    await mkdir(dirname(snapshotFilePath), { recursive: true });
    const stream = createWriteStream(snapshotFilePath, { encoding: 'utf8' });

    let streamError: Error | null = null;
    stream.on('error', (err) => {
      streamError = err;
    });

    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', (err) => reject(err));
    });

    let totalReceivedBytes = 0;
    let fileBytesWritten = 0;
    let snapshotTruncated = false;

    const inlineChunks: string[] = [];
    let inlineBytes = 0;
    let inlineTruncated = false;

    const eventClient = params.client as {
      on?: (event: string, handler: (evt: { chunk: string }) => void) => void;
      removeListener?: (event: string, handler: (evt: { chunk: string }) => void) => void;
    };
    const sendClient = params.client as {
      send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
    };

    const onChunk = (evt: { chunk: string }) => {
      const chunk = evt?.chunk ?? '';
      if (!chunk) return;

      const chunkBytes = Buffer.byteLength(chunk, 'utf8');
      totalReceivedBytes += chunkBytes;

      if (!snapshotTruncated) {
        if (streamError) {
          snapshotTruncated = true;
          params.limitations.push(
            `heap snapshot 写入失败：${streamError.message}（已停止写入与解析）`
          );
          return;
        }
        if (totalReceivedBytes > params.maxSnapshotBytes) {
          snapshotTruncated = true;
          params.limitations.push(
            `raw heap snapshot exceeded maxSnapshotBytes (${params.maxSnapshotBytes}) and was truncated; parsing skipped`
          );
        } else {
          stream.write(chunk);
          fileBytesWritten += chunkBytes;
        }
      }

      if (shouldReturnInline && !inlineTruncated && inlineBytes < params.maxInlineBytes) {
        const remaining = params.maxInlineBytes - inlineBytes;
        const sliced = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
        inlineChunks.push(sliced);
        inlineBytes += Buffer.byteLength(sliced, 'utf8');
        if (chunk.length > remaining) {
          inlineTruncated = true;
        }
      } else if (shouldReturnInline && inlineBytes >= params.maxInlineBytes) {
        inlineTruncated = true;
      }
    };

    eventClient.on?.('HeapProfiler.addHeapSnapshotChunk', onChunk);

    await sendClient.send('HeapProfiler.takeHeapSnapshot', { reportProgress: true });

    eventClient.removeListener?.('HeapProfiler.addHeapSnapshotChunk', onChunk);

    await new Promise<void>((resolve, reject) => {
      stream.end();
      stream.once('finish', resolve);
      stream.once('error', reject);
    });

    const exportInfo: HeapSnapshot['export'] = {
      mode: params.exportMode,
      filePath: shouldReturnFile ? snapshotFilePath : undefined,
      fileBytes: shouldReturnFile ? fileBytesWritten : undefined,
      inline: shouldReturnInline ? inlineChunks.join('') : undefined,
      inlineBytes: shouldReturnInline ? inlineBytes : undefined,
      truncated: snapshotTruncated || inlineTruncated ? true : undefined,
      maxInlineBytes: shouldReturnInline ? params.maxInlineBytes : undefined,
    };

    return {
      snapshotFilePath,
      isTempFile,
      fileBytesWritten,
      snapshotTruncated,
      streamError,
      exportInfo,
    };
  }
}

