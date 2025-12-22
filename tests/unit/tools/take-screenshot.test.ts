import { describe, it, expect, beforeEach, vi } from 'vitest';
import { takeScreenshotTool } from '../../../src/tools/take-screenshot.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { ConsoleHandler } from '../../../src/cdp-handlers/console-handler.js';
import { ElementHandler } from '../../../src/cdp-handlers/element-handler.js';
import { CacheHandler } from '../../../src/cdp-handlers/cache-handler.js';
import { PerformanceHandler } from '../../../src/cdp-handlers/performance-handler.js';
import { HeapHandler } from '../../../src/cdp-handlers/heap-handler.js';
import { LighthouseHandler } from '../../../src/cdp-handlers/lighthouse-handler.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';
import * as screenshotUtils from '../../../src/utils/screenshot-utils.js';

// Mock screenshot utils
vi.mock('../../../src/utils/screenshot-utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/utils/screenshot-utils.js')>();
    return {
        ...actual,
        saveScreenshotToFile: vi.fn(),
        ensurePageFullyLoaded: vi.fn(),
    };
});

describe('takeScreenshotTool', () => {
    let mockBrowserManager: any;
    let context: any;
    let mockPage: MockPage;

    beforeEach(() => {
        mockPage = createMockPage('http://example.com');
        mockBrowserManager = {
            getPage: vi.fn().mockResolvedValue(mockPage),
        };

        context = {
            browserManager: mockBrowserManager,
            consoleHandler: {} as ConsoleHandler,
            elementHandler: {} as ElementHandler,
            cacheHandler: {} as CacheHandler,
            performanceHandler: {} as PerformanceHandler,
            heapHandler: {} as HeapHandler,
            lighthouseHandler: {} as LighthouseHandler,
        };

        vi.clearAllMocks();
    });

    describe('input validation', () => {
        it('should accept valid parameters', () => {
            const result = takeScreenshotTool.inputSchema.safeParse({
                url: 'http://example.com',
                fullPage: true,
                outputMode: 'auto',
            });
            expect(result.success).toBe(true);
        });

        it('should accept minimal parameters', () => {
            const result = takeScreenshotTool.inputSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it('should validate outputMode enum', () => {
            const validResult = takeScreenshotTool.inputSchema.safeParse({
                outputMode: 'file',
            });
            expect(validResult.success).toBe(true);

            const invalidResult = takeScreenshotTool.inputSchema.safeParse({
                outputMode: 'invalid',
            });
            expect(invalidResult.success).toBe(false);
        });

        it('should validate scrollDelay as non-negative integer', () => {
            const validResult = takeScreenshotTool.inputSchema.safeParse({
                scrollDelay: 1000,
            });
            expect(validResult.success).toBe(true);

            const invalidResult = takeScreenshotTool.inputSchema.safeParse({
                scrollDelay: -1,
            });
            expect(invalidResult.success).toBe(false);
        });
    });

    describe('handler - inline mode', () => {
        it('should return base64 in inline mode', async () => {
            const result = await takeScreenshotTool.handler(
                {
                    url: 'http://example.com',
                    outputMode: 'inline',
                },
                context
            );

            expect(result.content[0].text).toContain('Screenshot taken (base64)');
            expect(result.content[0].text).toContain('data:image/png;base64,');
        });

        it('should not call ensurePageFullyLoaded for non-fullPage screenshots', async () => {
            await takeScreenshotTool.handler(
                {
                    outputMode: 'inline',
                },
                context
            );

            expect(screenshotUtils.ensurePageFullyLoaded).not.toHaveBeenCalled();
        });
    });

    describe('handler - file mode', () => {
        it('should save file in file mode', async () => {
            const mockFileResult = {
                filePath: './screenshots/test.png',
                isTempFile: false,
                size: 1024,
            };

            vi.mocked(screenshotUtils.saveScreenshotToFile).mockResolvedValue(
                mockFileResult
            );

            const result = await takeScreenshotTool.handler(
                {
                    url: 'http://example.com',
                    outputMode: 'file',
                },
                context
            );

            expect(screenshotUtils.saveScreenshotToFile).toHaveBeenCalled();
            expect(result.content[0].text).toContain('Screenshot saved to');
            expect(result.content[0].text).toContain(mockFileResult.filePath);
            expect(result.content[0].text).toContain('KB');
        });

        it('should use custom filePath if provided', async () => {
            const customPath = './custom/path/screenshot.png';
            const mockFileResult = {
                filePath: customPath,
                isTempFile: false,
                size: 2048,
            };

            vi.mocked(screenshotUtils.saveScreenshotToFile).mockResolvedValue(
                mockFileResult
            );

            await takeScreenshotTool.handler(
                {
                    outputMode: 'file',
                    filePath: customPath,
                },
                context
            );

            expect(screenshotUtils.saveScreenshotToFile).toHaveBeenCalledWith(
                expect.any(Buffer),
                customPath
            );
        });
    });

    describe('handler - auto mode', () => {
        it('should return base64 for small images', async () => {
            // Mock a small buffer (less than threshold)
            const smallBuffer = Buffer.alloc(50 * 1024); // 50KB

            vi.spyOn(mockPage, 'screenshot').mockResolvedValue(smallBuffer);

            const result = await takeScreenshotTool.handler(
                {
                    url: 'http://example.com',
                    outputMode: 'auto',
                },
                context
            );

            expect(result.content[0].text).toContain('Screenshot taken (base64)');
            expect(screenshotUtils.saveScreenshotToFile).not.toHaveBeenCalled();
        });

        it('should save file for large images', async () => {
            // Mock a large buffer (exceeds threshold)
            const largeBuffer = Buffer.alloc(200 * 1024); // 200KB
            const mockFileResult = {
                filePath: './screenshots/large.png',
                isTempFile: false,
                size: 200 * 1024,
            };

            vi.spyOn(mockPage, 'screenshot').mockResolvedValue(largeBuffer);
            vi.mocked(screenshotUtils.saveScreenshotToFile).mockResolvedValue(
                mockFileResult
            );

            const result = await takeScreenshotTool.handler(
                {
                    url: 'http://example.com',
                    outputMode: 'auto',
                    maxBase64SizeKB: 100,
                },
                context
            );

            expect(screenshotUtils.saveScreenshotToFile).toHaveBeenCalled();
            expect(result.content[0].text).toContain('Screenshot saved to');
        });

        it('should use custom threshold', async () => {
            const mediumBuffer = Buffer.alloc(150 * 1024); // 150KB
            const mockFileResult = {
                filePath: './screenshots/medium.png',
                isTempFile: false,
                size: 150 * 1024,
            };

            vi.spyOn(mockPage, 'screenshot').mockResolvedValue(mediumBuffer);
            vi.mocked(screenshotUtils.saveScreenshotToFile).mockResolvedValue(
                mockFileResult
            );

            // With threshold 50KB, 150KB should be saved as file
            await takeScreenshotTool.handler(
                {
                    outputMode: 'auto',
                    maxBase64SizeKB: 50,
                },
                context
            );

            expect(screenshotUtils.saveScreenshotToFile).toHaveBeenCalled();
        });
    });

    describe('handler - fullPage screenshots', () => {
        it('should call ensurePageFullyLoaded for fullPage screenshots', async () => {
            vi.mocked(screenshotUtils.ensurePageFullyLoaded).mockResolvedValue(
                undefined
            );

            await takeScreenshotTool.handler(
                {
                    url: 'http://example.com',
                    fullPage: true,
                },
                context
            );

            expect(screenshotUtils.ensurePageFullyLoaded).toHaveBeenCalledWith(
                mockPage,
                1000 // default scrollDelay
            );
        });

        it('should use custom scrollDelay', async () => {
            vi.mocked(screenshotUtils.ensurePageFullyLoaded).mockResolvedValue(
                undefined
            );

            await takeScreenshotTool.handler(
                {
                    fullPage: true,
                    scrollDelay: 2000,
                },
                context
            );

            expect(screenshotUtils.ensurePageFullyLoaded).toHaveBeenCalledWith(
                mockPage,
                2000
            );
        });
    });

    describe('handler - waitForSelector', () => {
        it('should wait for selector if provided', async () => {
            const waitForSelectorSpy = vi
                .spyOn(mockPage, 'waitForSelector')
                .mockResolvedValue(null as any);

            await takeScreenshotTool.handler(
                {
                    url: 'http://example.com',
                    waitForSelector: '.main-content',
                },
                context
            );

            expect(waitForSelectorSpy).toHaveBeenCalledWith('.main-content', {
                timeout: 10000,
            });
        });

        it('should continue if selector wait times out', async () => {
            const waitForSelectorSpy = vi
                .spyOn(mockPage, 'waitForSelector')
                .mockRejectedValue(new Error('Timeout'));

            await expect(
                takeScreenshotTool.handler(
                    {
                        waitForSelector: '.non-existent',
                    },
                    context
                )
            ).resolves.not.toThrow();

            expect(waitForSelectorSpy).toHaveBeenCalled();
        });
    });

    describe('handler - response format', () => {
        it('should return correct response format', async () => {
            const result = await takeScreenshotTool.handler(
                {
                    outputMode: 'inline',
                },
                context
            );

            expect(result).toHaveProperty('content');
            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toHaveProperty('type', 'text');
            expect(result.content[0]).toHaveProperty('text');
        });
    });
});

