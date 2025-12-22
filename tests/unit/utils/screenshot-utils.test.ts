import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    saveScreenshotToFile,
    calculateBase64Size,
    ensurePageFullyLoaded,
} from '../../../src/utils/screenshot-utils.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
}));

describe('screenshot-utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('saveScreenshotToFile', () => {
        it('should save screenshot to default path', async () => {
            const mockBuffer = Buffer.from('test-screenshot-data');
            const mockStats = { size: mockBuffer.length };

            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockResolvedValue(undefined);
            vi.mocked(stat).mockResolvedValue(mockStats as any);

            const result = await saveScreenshotToFile(mockBuffer);

            expect(mkdir).toHaveBeenCalled();
            expect(writeFile).toHaveBeenCalled();
            expect(stat).toHaveBeenCalled();
            expect(result.filePath).toContain('screenshots');
            expect(result.filePath).toContain('screenshot-');
            expect(result.filePath).toContain('.png');
            // When no filePath is provided, it uses defaultPath which is not a temp file
            expect(result.isTempFile).toBe(false);
            expect(result.size).toBe(mockBuffer.length);
        });

        it('should save screenshot to custom path', async () => {
            const mockBuffer = Buffer.from('test-screenshot-data');
            const customPath = './custom/path/screenshot.png';
            const mockStats = { size: mockBuffer.length };

            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockResolvedValue(undefined);
            vi.mocked(stat).mockResolvedValue(mockStats as any);

            const result = await saveScreenshotToFile(mockBuffer, customPath);

            expect(mkdir).toHaveBeenCalled();
            expect(writeFile).toHaveBeenCalledWith(customPath, mockBuffer);
            expect(result.filePath).toBe(customPath);
            expect(result.isTempFile).toBe(false);
        });

        it('should create directory if not exists', async () => {
            const mockBuffer = Buffer.from('test-screenshot-data');
            const customPath = './new/dir/screenshot.png';
            const mockStats = { size: mockBuffer.length };

            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockResolvedValue(undefined);
            vi.mocked(stat).mockResolvedValue(mockStats as any);

            await saveScreenshotToFile(mockBuffer, customPath);

            expect(mkdir).toHaveBeenCalledWith('./new/dir', { recursive: true });
        });
    });

    describe('calculateBase64Size', () => {
        it('should calculate base64 size correctly', () => {
            // Base64 编码 "test" = "dGVzdA==" (8 chars)
            // 原始大小 = 4 bytes
            // Base64 大小 ≈ 8 * 3/4 = 6 bytes (实际是 4 bytes)
            const base64 = 'dGVzdA==';
            const size = calculateBase64Size(base64);
            expect(size).toBeGreaterThan(0);
            expect(size).toBeLessThanOrEqual(8);
        });

        it('should handle data URI prefix', () => {
            const base64 = 'data:image/png;base64,dGVzdA==';
            const size = calculateBase64Size(base64);
            expect(size).toBeGreaterThan(0);
        });

        it('should handle empty string', () => {
            const size = calculateBase64Size('');
            expect(size).toBe(0);
        });

        it('should calculate size for larger base64 string', () => {
            // 创建一个较大的 base64 字符串
            const largeBuffer = Buffer.alloc(1000, 'a');
            const base64 = largeBuffer.toString('base64');
            const size = calculateBase64Size(base64);
            expect(size).toBeGreaterThan(700); // 应该接近 1000 * 3/4 = 750
            // Base64 编码后大小可能略大于原文件，允许一些误差
            expect(size).toBeLessThanOrEqual(1500);
        });
    });

    describe('ensurePageFullyLoaded', () => {
        it('should wait for page load and scroll', async () => {
            const mockPage = createMockPage('http://example.com');
            const scrollToSpy = vi.fn();
            const addEventListenerSpy = vi.fn();

            // Mock evaluate to simulate browser environment
            vi.spyOn(mockPage, 'evaluate').mockImplementation((fn: any) => {
                if (typeof fn === 'function') {
                    // Simulate browser environment
                    const mockWindow = {
                        scrollTo: scrollToSpy,
                        addEventListener: addEventListenerSpy,
                    };
                    const mockDocument = {
                        readyState: 'complete',
                        body: {
                            scrollHeight: 1000,
                        },
                    };
                    // Execute the function in the mock context
                    try {
                        const result = fn.call({
                            window: mockWindow,
                            document: mockDocument,
                        });
                        return Promise.resolve(result);
                    } catch (error) {
                        // If function uses window/document directly, wrap it
                        const wrappedFn = new Function(
                            'window',
                            'document',
                            `return (${fn.toString()})()`
                        );
                        return Promise.resolve(
                            wrappedFn.call(null, mockWindow, mockDocument)
                        );
                    }
                }
                return Promise.resolve('complete');
            });

            await ensurePageFullyLoaded(mockPage as any, 10);

            // Should have called evaluate for scrolling
            expect(mockPage.evaluate).toHaveBeenCalled();
        });

        it('should handle page load timeout gracefully', async () => {
            const mockPage = createMockPage('http://example.com');
            const evaluateSpy = vi.spyOn(mockPage, 'evaluate');

            // Mock evaluate to simulate timeout
            evaluateSpy.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => resolve('complete'), 50);
                });
            });

            await expect(
                ensurePageFullyLoaded(mockPage as any, 50)
            ).resolves.not.toThrow();
        });

        it('should scroll to bottom', async () => {
            const mockPage = createMockPage('http://example.com');
            const scrollToSpy = vi.fn();

            vi.spyOn(mockPage, 'evaluate').mockImplementation((fn: any) => {
                if (typeof fn === 'function') {
                    // Simulate browser environment with scrollTo
                    const mockWindow = {
                        scrollTo: scrollToSpy,
                        addEventListener: vi.fn(),
                    };
                    const mockDocument = {
                        readyState: 'complete',
                        body: {
                            scrollHeight: 1000,
                        },
                    };
                    // Execute the function - it will call window.scrollTo
                    try {
                        const result = fn.call({
                            window: mockWindow,
                            document: mockDocument,
                        });
                        return Promise.resolve(result);
                    } catch (error) {
                        // If function uses window/document directly, create a context
                        const context = {
                            window: mockWindow,
                            document: mockDocument,
                        };
                        // Use Function constructor to execute in context
                        const funcStr = fn.toString();
                        const wrappedFn = new Function(
                            'window',
                            'document',
                            `return (${funcStr})()`
                        );
                        return Promise.resolve(wrappedFn(mockWindow, mockDocument));
                    }
                }
                return Promise.resolve('complete');
            });

            await ensurePageFullyLoaded(mockPage as any, 10);

            // Should have called scrollTo (at least once for scrolling)
            expect(scrollToSpy).toHaveBeenCalled();
        });
    });
});

