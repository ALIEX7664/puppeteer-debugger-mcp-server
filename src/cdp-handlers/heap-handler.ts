import { Page } from 'puppeteer';
import {
  HeapSnapshot,
  MemoryAnalysis,
  AllocationTracking,
  GetHeapSnapshotParams,
  AnalyzeMemoryParams,
  TrackAllocationsParams,
} from '../types.js';
import { BrowserManager } from '../browser-manager.js';
import { createWriteStream } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

      // 采集 raw snapshot：默认落到临时文件（解析需要），按 mode 决定是否对外暴露
      const shouldReturnFile = exportMode === 'file' || exportMode === 'both';
      const shouldReturnInline = exportMode === 'inline' || exportMode === 'both';

      const isTempFile =
        !params.export?.filePath || exportMode === 'none' || exportMode === 'inline';
      const snapshotFilePath =
        params.export?.filePath ??
        join(tmpdir(), `mcp-heap-${Date.now()}-${randomUUID()}.heapsnapshot.json`);

      const stream = createWriteStream(snapshotFilePath, { encoding: 'utf8' });

      let totalReceivedBytes = 0;
      let fileBytesWritten = 0;
      let snapshotTruncated = false;

      const inlineChunks: string[] = [];
      let inlineBytes = 0;
      let inlineTruncated = false;

      const onChunk = (evt: { chunk: string }) => {
        const chunk = evt?.chunk ?? '';
        if (!chunk) return;

        const chunkBytes = Buffer.byteLength(chunk, 'utf8');
        totalReceivedBytes += chunkBytes;

        // 写入文件（用于解析/可选导出 file）
        if (!snapshotTruncated) {
          if (totalReceivedBytes > maxSnapshotBytes) {
            snapshotTruncated = true;
            limitations.push(
              `raw heap snapshot exceeded maxSnapshotBytes (${maxSnapshotBytes}) and was truncated; parsing skipped`
            );
          } else {
            stream.write(chunk);
            fileBytesWritten += chunkBytes;
          }
        }

        // 收集 inline（可选导出）
        if (shouldReturnInline && !inlineTruncated && inlineBytes < maxInlineBytes) {
          // 注意：这里按字符 slice（heap snapshot 基本为 ASCII JSON），字节级精确截断的收益不大
          const remaining = maxInlineBytes - inlineBytes;
          const sliced = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
          inlineChunks.push(sliced);
          inlineBytes += Buffer.byteLength(sliced, 'utf8');
          if (chunk.length > remaining) {
            inlineTruncated = true;
          }
        } else if (shouldReturnInline && inlineBytes >= maxInlineBytes) {
          inlineTruncated = true;
        }
      };

      const onProgress = (_evt: any) => {
        // 目前仅用于兼容/将来扩展；takeHeapSnapshot 结束即代表完成
      };

      // 注册 chunk/progress 监听
      (client as any).on?.('HeapProfiler.addHeapSnapshotChunk', onChunk);
      (client as any).on?.('HeapProfiler.reportHeapSnapshotProgress', onProgress);

      // 获取堆快照（通过事件流输出 chunks）
      await client.send('HeapProfiler.takeHeapSnapshot', {
        reportProgress: true,
      });

      // 清理监听并关闭写入流
      (client as any).removeListener?.('HeapProfiler.addHeapSnapshotChunk', onChunk);
      (client as any).removeListener?.(
        'HeapProfiler.reportHeapSnapshotProgress',
        onProgress
      );

      await new Promise<void>((resolve, reject) => {
        stream.end();
        stream.once('finish', resolve);
        stream.once('error', reject);
      });

      // 导出信息（对外）
      const exportInfo: HeapSnapshot['export'] = {
        mode: exportMode,
        filePath: shouldReturnFile ? snapshotFilePath : undefined,
        fileBytes: shouldReturnFile ? fileBytesWritten : undefined,
        inline: shouldReturnInline ? inlineChunks.join('') : undefined,
        inlineBytes: shouldReturnInline ? inlineBytes : undefined,
        truncated: snapshotTruncated || inlineTruncated ? true : undefined,
        maxInlineBytes: shouldReturnInline ? maxInlineBytes : undefined,
      };

      // 解析（如果未截断且体积可控）
      let parsed = false;
      let totalNodes: number | undefined;
      let totalSizeBytes: number | undefined;
      let topConstructors: any[] | undefined;
      let topNodes: any[] | undefined;

      try {
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
      // 启用 HeapProfiler
      await client.send('HeapProfiler.enable');

      // 开始跟踪分配
      await client.send('HeapProfiler.startTrackingHeapObjects', {
        trackAllocations: true,
      });

      // 等待指定时间
      const duration = params.duration || 5000;
      await new Promise((resolve) => setTimeout(resolve, duration));

      // 停止跟踪并获取结果
      await client.send('HeapProfiler.stopTrackingHeapObjects', {
        reportProgress: false,
      });

      // 获取分配采样数据
      const allocations: AllocationTracking['allocations'] = [];
      let totalAllocated = 0;

      // 获取堆统计
      const heapStats = await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });

      totalAllocated = heapStats;

      const tracking: AllocationTracking = {
        allocations,
        totalAllocated,
        count: allocations.length,
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
}

