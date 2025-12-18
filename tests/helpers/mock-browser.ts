import { Browser, Page } from 'puppeteer';
import { MockPage } from './mock-page.js';

// Re-export MockPage for convenience
export { MockPage };

/**
 * Mock Browser 实现
 * 注意：不直接实现 Browser 接口以避免类型冲突，使用类型断言在需要时转换
 */
export class MockBrowser {
  private _pages: MockPage[] = [];
  private _closed: boolean = false;
  private _closeListeners: Array<() => void> = [];

  async newPage(): Promise<Page> {
    const mockPage = new MockPage();
    this._pages.push(mockPage);
    return mockPage as unknown as Page;
  }

  async close(): Promise<void> {
    this._closed = true;
    for (const page of this._pages) {
      await page.close();
    }
    this._closeListeners.forEach((handler) => handler());
  }

  pages(): Page[] {
    return this._pages as unknown as Page[];
  }

  isConnected(): boolean {
    return !this._closed;
  }

  on<Key extends keyof any>(
    type: Key,
    handler: (...args: any[]) => void
  ): Browser {
    if (type === 'disconnected') {
      this._closeListeners.push(handler);
    }
    return this as unknown as Browser;
  }

  // Helper methods for testing
  getMockPages(): MockPage[] {
    return this._pages;
  }

  createPageWithUrl(url: string): MockPage {
    const mockPage = new MockPage(url);
    this._pages.push(mockPage);
    return mockPage;
  }
}

/**
 * 创建 Mock Browser 实例
 */
export function createMockBrowser(): MockBrowser {
  return new MockBrowser();
}

/**
 * 创建 Mock Page 实例
 */
export function createMockPage(url?: string): MockPage {
  return new MockPage(url);
}

