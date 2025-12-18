import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeapHandler } from '../../../src/cdp-handlers/heap-handler.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, readFile } from 'node:fs/promises';

// Mock BrowserManager
vi.mock('../../../src/browser-manager.js', () => {
    return {
        BrowserManager: {
            getInstance: vi.fn(),
        },
    };
});

function buildMinimalHeapSnapshotJson(): string {
    // Minimal structure required by HeapHandler.parseV8HeapSnapshot()
    return JSON.stringify({
        snapshot: {
            meta: {
                node_fields: ['type', 'name', 'id', 'self_size'],
                node_types: [
                    ['hidden', 'array', 'string', 'object', 'native'],
                    'string',
                    'number',
                    'number',
                ],
            },
            node_count: 3,
        },
        strings: ['(root)', 'Foo', 'Bar'],
        nodes: [
            // type, nameIndex, id, self_size
            3, 1, 100, 1000, // Foo object
            3, 2, 101, 5000, // Bar object
            4, 1, 102, 2000, // Foo native
        ],
    });
}

describe('HeapHandler', () => {
    let handler: HeapHandler;
    let mockBrowserManager: any;
    let mockPage: MockPage;

    beforeEach(() => {
        mockPage = createMockPage('http://example.com');
        mockBrowserManager = {
            getPage: vi.fn().mockResolvedValue(mockPage),
        };
        handler = new HeapHandler(mockBrowserManager as unknown as BrowserManager);
    });

    it('should stream chunks and parse summary (inline export with truncation)', async () => {
        const raw = buildMinimalHeapSnapshotJson();
        // split into many chunks to exercise streaming + inline truncation
        const chunks: string[] = [];
        for (let i = 0; i < raw.length; i += 10) chunks.push(raw.slice(i, i + 10));
        (mockPage as any).setHeapSnapshotChunks(chunks);

        const result = await handler.getHeapSnapshot({
            url: 'http://example.com',
            topN: 2,
            export: { mode: 'inline', maxInlineBytes: 25 },
            maxSnapshotBytes: 1024 * 1024,
            maxParseBytes: 1024 * 1024,
        });

        expect(result).toHaveProperty('timestamp');
        expect(result.export.mode).toBe('inline');
        expect(typeof result.export.inline).toBe('string');
        expect((result.export.inline as string).length).toBeGreaterThan(0);
        expect((result.export.inlineBytes as number) <= 25).toBe(true);
        expect(result.export.truncated).toBe(true);

        expect(result.summary.parsed).toBe(true);
        expect(result.summary.totalNodes).toBe(3);
        expect(result.summary.totalSizeBytes).toBe(8000);

        // topConstructors by aggregated self size: Bar (5000) then Foo (3000)
        expect(result.summary.topConstructors?.[0]).toMatchObject({
            name: 'Bar',
            count: 1,
            selfSizeBytes: 5000,
        });
        expect(result.summary.topConstructors?.[1]).toMatchObject({
            name: 'Foo',
            count: 2,
            selfSizeBytes: 3000,
        });

        // topNodes by self size: 5000 then 2000
        expect(result.summary.topNodes?.[0]).toMatchObject({
            name: 'Bar',
            selfSizeBytes: 5000,
        });
        expect(result.summary.topNodes?.[1].selfSizeBytes).toBe(2000);
    });

    it('should export to file when mode=file and keep file on disk', async () => {
        const raw = buildMinimalHeapSnapshotJson();
        (mockPage as any).setHeapSnapshotRawJson(raw);

        const filePath = join(tmpdir(), `heap-handler-test-${Date.now()}.heapsnapshot.json`);

        try {
            const result = await handler.getHeapSnapshot({
                url: 'http://example.com',
                topN: 2,
                export: { mode: 'file', filePath },
                maxSnapshotBytes: 1024 * 1024,
                maxParseBytes: 1024 * 1024,
            });

            expect(result.export.mode).toBe('file');
            expect(result.export.filePath).toBe(filePath);
            expect((result.export.fileBytes ?? 0) > 0).toBe(true);
            expect(result.summary.parsed).toBe(true);
            expect(result.summary.totalSizeBytes).toBe(8000);

            const onDisk = await readFile(filePath, 'utf8');
            expect(onDisk).toContain('"snapshot"');
            expect(JSON.parse(onDisk)).toHaveProperty('nodes');
        } finally {
            await rm(filePath, { force: true }).catch(() => {
                // ignore
            });
        }
    });
});


