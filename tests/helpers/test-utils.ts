import { vi } from 'vitest';
import { BrowserManager } from '../../src/browser-manager.js';
import { MockBrowser, MockPage } from './mock-browser.js';
import type { Browser, Page } from 'puppeteer';

/**
 * 创建 Mock BrowserManager
 */
export function createMockBrowserManager(): {
  browserManager: BrowserManager;
  mockBrowser: MockBrowser;
  mockPages: MockPage[];
} {
  const mockBrowser = new MockBrowser();
  const mockPages: MockPage[] = [];

  // Mock puppeteer.launch
  vi.mock('puppeteer', async () => {
    const actual = await vi.importActual('puppeteer');
    return {
      ...actual,
      default: {
        launch: vi.fn().mockResolvedValue(mockBrowser),
      },
    };
  });

  const browserManager = BrowserManager.getInstance();

  return {
    browserManager,
    mockBrowser,
    mockPages,
  };
}

/**
 * 重置 BrowserManager 单例（用于测试）
 */
export function resetBrowserManagerInstance(): void {
  // 通过反射访问私有 instance
  const BrowserManagerClass = BrowserManager as any;
  BrowserManagerClass.instance = undefined;
}

/**
 * Mock 文件系统访问
 */
export function mockFileSystem(files: Record<string, boolean>): void {
  vi.mock('fs', () => ({
    existsSync: vi.fn((path: string) => files[path] ?? false),
  }));

  vi.mock('fs/promises', () => ({
    access: vi.fn(async (path: string) => {
      if (!files[path]) {
        throw new Error('File not found');
      }
    }),
  }));
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 创建测试用的 URL
 */
export function createTestUrl(path: string = ''): string {
  return `http://localhost:3000${path}`;
}

/**
 * 验证对象是否包含必需的属性
 */
export function hasRequiredProperties<T extends Record<string, any>>(
  obj: any,
  requiredKeys: (keyof T)[]
): obj is T {
  return requiredKeys.every((key) => key in obj);
}

/**
 * 创建 Mock Console Message
 */
export function createMockConsoleMessage(
  type: string,
  text: string,
  url: string = 'http://localhost:3000'
) {
  return {
    type: () => type,
    text: () => text,
    location: () => ({
      url,
      lineNumber: 1,
      columnNumber: 1,
    }),
  };
}

/**
 * 创建 Mock HTTP Request
 */
export function createMockHTTPRequest(url: string) {
  return {
    url: () => url,
    method: () => 'GET',
    headers: () => ({}),
  };
}

