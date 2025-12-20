import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HeapHandler } from '../../../src/cdp-handlers/heap-handler.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';

function buildMinimalTraceHeapSnapshotJson(): string {
  // Minimal structure required by HeapHandler.parseV8HeapSnapshotAllocationTrace()
  return JSON.stringify({
    snapshot: {
      meta: {
        trace_node_fields: ['id', 'function_info_index', 'count', 'size', 'children'],
        trace_function_info_fields: ['function_id', 'name', 'script_name', 'line', 'column'],
      },
    },
    strings: ['(root)', 'foo', 'bar', 'app.js'],
    trace_function_infos: [
      // function_id, nameIndex, scriptNameIndex, line, column
      0, 0, 3, 0, 0, // root
      1, 1, 3, 20, 2, // foo
      2, 2, 3, 50, 1, // bar
    ],
    trace_tree: [
      // id, fnInfoIndex, count, size, children
      1, 0, 3, 600, 1, // root
      2, 1, 3, 600, 1, // foo
      3, 2, 2, 500, 0, // bar (leaf)
    ],
  });
}

describe('HeapHandler.trackAllocations', () => {
  let handler: HeapHandler;
  let mockBrowserManager: { getPage: ReturnType<typeof vi.fn> };
  let mockPage: MockPage;

  beforeEach(() => {
    mockPage = createMockPage('http://example.com');
    mockBrowserManager = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    };
    handler = new HeapHandler(mockBrowserManager as unknown as BrowserManager);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should parse trace_tree and return TopN stacks (no export)', async () => {
    vi.useFakeTimers();
    mockPage.setHeapSnapshotRawJson(buildMinimalTraceHeapSnapshotJson());

    const promise = handler.trackAllocations({
      url: 'http://example.com',
      duration: 1000,
      topN: 5,
      export: { mode: 'none' },
      maxSnapshotBytes: 1024 * 1024,
      maxParseBytes: 1024 * 1024,
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.summary?.parsed).toBe(true);
    expect(result.summary?.totalAllocatedBytes).toBe(600);
    expect(result.summary?.totalCount).toBe(3);

    // leaf stack should be: foo -> bar
    const topStacks = result.summary?.topStacks ?? [];
    expect(topStacks.length).toBe(1);
    expect(topStacks[0]?.sizeBytes).toBe(500);
    expect(topStacks[0]?.count).toBe(2);
    expect(topStacks[0]?.stackTrace.join(' | ')).toContain('foo (app.js:20:2)');
    expect(topStacks[0]?.stackTrace.join(' | ')).toContain('bar (app.js:50:1)');

    // legacy mapping: allocations are TopN stacks
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0]?.size).toBe(500);
    expect(result.allocations[0]?.stackTrace?.length).toBe(2);
    expect(result.export?.mode).toBe('none');
    expect(result.export?.filePath).toBeUndefined();
  });

  it('should export to file when mode=file and keep file on disk', async () => {
    vi.useFakeTimers();
    mockPage.setHeapSnapshotRawJson(buildMinimalTraceHeapSnapshotJson());

    const filePath = join(tmpdir(), `alloc-trace-${Date.now()}.heapsnapshot`);

    try {
      const promise = handler.trackAllocations({
        url: 'http://example.com',
        duration: 1000,
        topN: 5,
        export: { mode: 'file', filePath },
        maxSnapshotBytes: 1024 * 1024,
        maxParseBytes: 1024 * 1024,
      });

      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.export?.mode).toBe('file');
      expect(result.export?.filePath).toBe(filePath);

      const onDisk = await readFile(filePath, 'utf8');
      expect(onDisk).toContain('"trace_tree"');
      expect(onDisk).toContain('"trace_function_infos"');
    } finally {
      await rm(filePath, { force: true }).catch(() => {
        // ignore
      });
    }
  });
});


