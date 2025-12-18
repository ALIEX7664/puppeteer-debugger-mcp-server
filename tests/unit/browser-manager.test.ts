import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserManager } from '../../src/browser-manager.js';
import { MockBrowser, MockPage, createMockBrowser, createMockPage } from '../helpers/mock-browser.js';
import type { Browser } from 'puppeteer';

// Mock puppeteer
vi.mock('puppeteer', () => {
  return {
    default: {
      launch: vi.fn(),
    },
  };
});

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
}));

describe('BrowserManager', () => {
  let mockBrowser: MockBrowser;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Reset singleton instance
    (BrowserManager as any).instance = undefined;
    
    // Save original env
    originalEnv = { ...process.env };
    
    // Create mock browser
    mockBrowser = createMockBrowser();
    
    // Mock puppeteer.launch
    const puppeteer = await import('puppeteer');
    vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser as unknown as Browser);
  });

  afterEach(async () => {
    // Restore env
    process.env = originalEnv;
    
    // Clean up
    const instance = BrowserManager.getInstance();
    if (instance.isInitialized()) {
      await instance.close();
    }
    
    // Reset singleton
    (BrowserManager as any).instance = undefined;
    
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BrowserManager.getInstance();
      const instance2 = BrowserManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should accept config on first call only', () => {
      const config1 = { headless: false };
      const instance1 = BrowserManager.getInstance(config1);
      const config2 = { headless: true };
      const instance2 = BrowserManager.getInstance(config2);
      expect(instance1).toBe(instance2);
    });
  });

  describe('Lazy Initialization', () => {
    it('should not initialize browser on instance creation', () => {
      const instance = BrowserManager.getInstance();
      expect(instance.isInitialized()).toBe(false);
    });

    it('should initialize browser on first getPage call', async () => {
      const instance = BrowserManager.getInstance();
      const mockPage = createMockPage('http://example.com');
      mockBrowser.createPageWithUrl('http://example.com');
      
      const puppeteer = await import('puppeteer');
      await instance.getPage('http://example.com');
      
      expect(puppeteer.default.launch).toHaveBeenCalled();
      expect(instance.isInitialized()).toBe(true);
    });

    it('should handle concurrent initialization', async () => {
      const instance = BrowserManager.getInstance();
      const mockPage = createMockPage('http://example.com');
      mockBrowser.createPageWithUrl('http://example.com');
      
      const puppeteer = await import('puppeteer');
      const promises = [
        instance.getPage('http://example.com'),
        instance.getPage('http://example.com'),
        instance.getPage('http://example.com'),
      ];
      
      await Promise.all(promises);
      
      // Should only launch once
      expect(puppeteer.default.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Page Management', () => {
    it('should create and cache pages by URL', async () => {
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      const mockPage = createMockPage(url);
      mockBrowser.createPageWithUrl(url);
      
      const page1 = await instance.getPage(url);
      const page2 = await instance.getPage(url);
      
      expect(page1).toBe(page2);
    });

    it('should normalize URLs', async () => {
      const instance = BrowserManager.getInstance();
      const url1 = 'http://example.com';
      const url2 = 'http://example.com/';
      const mockPage = createMockPage(url1);
      mockBrowser.createPageWithUrl(url1);
      
      const page1 = await instance.getPage(url1);
      const page2 = await instance.getPage(url2);
      
      // Should return the same page for normalized URLs
      expect(page1).toBe(page2);
    });

    it('should handle page limit', async () => {
      const instance = BrowserManager.getInstance();
      const maxPages = 5;
      
      // Create more than maxPages
      for (let i = 0; i < maxPages + 2; i++) {
        const url = `http://example${i}.com`;
        mockBrowser.createPageWithUrl(url);
        await instance.getPage(url);
      }
      
      const pages = instance.getPages();
      expect(pages.length).toBeLessThanOrEqual(maxPages);
    });

    it('should remove closed pages from cache', async () => {
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      const mockPage = createMockPage(url);
      mockBrowser.createPageWithUrl(url);
      
      const page = await instance.getPage(url);
      await (page as any).close();
      
      // Should create a new page
      const newPage = await instance.getPage(url);
      expect(newPage).not.toBe(page);
    });
  });

  describe('Navigation', () => {
    it('should navigate to URL', async () => {
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      const mockPage = createMockPage(url);
      mockBrowser.createPageWithUrl(url);
      
      const page = await instance.navigate(url);
      expect(page).toBeDefined();
    });

    it('should reuse existing page for same URL', async () => {
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      const mockPage = createMockPage(url);
      mockBrowser.createPageWithUrl(url);
      
      const page1 = await instance.navigate(url);
      const page2 = await instance.navigate(url);
      
      expect(page1).toBe(page2);
    });
  });

  describe('Page Cleanup', () => {
    it('should close specific page', async () => {
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      const mockPage = createMockPage(url);
      mockBrowser.createPageWithUrl(url);
      
      await instance.getPage(url);
      await instance.closePage(url);
      
      const pages = instance.getPages();
      expect(pages.find((p) => p.url === url)).toBeUndefined();
    });

    it('should close all pages', async () => {
      const instance = BrowserManager.getInstance();
      const urls = ['http://example1.com', 'http://example2.com'];
      
      for (const url of urls) {
        mockBrowser.createPageWithUrl(url);
        await instance.getPage(url);
      }
      
      await instance.closeAllPages();
      
      const pages = instance.getPages();
      expect(pages.length).toBe(0);
    });
  });

  describe('Browser Cleanup', () => {
    it('should close browser gracefully', async () => {
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      const mockPage = createMockPage(url);
      mockBrowser.createPageWithUrl(url);
      
      await instance.getPage(url);
      await instance.close();
      
      expect(instance.isInitialized()).toBe(false);
      expect(mockBrowser.isConnected()).toBe(false);
    });

    it('should handle close when not initialized', async () => {
      const instance = BrowserManager.getInstance();
      await expect(instance.close()).resolves.not.toThrow();
    });
  });

  describe('Local Browser Detection', () => {
    it('should use environment variable if set and exists', async () => {
      const customPath = '/custom/chrome/path';
      process.env.PUPPETEER_EXECUTABLE_PATH = customPath;
      
      const { existsSync } = await import('fs');
      const { access } = await import('fs/promises');
      
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(access).mockResolvedValue(undefined);
      
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      mockBrowser.createPageWithUrl(url);
      
      await instance.getPage(url);
      
      const puppeteer = await import('puppeteer');
      expect(puppeteer.default.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          executablePath: customPath,
        })
      );
    });

    it('should not set executablePath if env var path does not exist', async () => {
      const customPath = '/nonexistent/path';
      process.env.PUPPETEER_EXECUTABLE_PATH = customPath;
      
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);
      
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      mockBrowser.createPageWithUrl(url);
      
      await instance.getPage(url);
      
      const puppeteer = await import('puppeteer');
      const callArgs = vi.mocked(puppeteer.default.launch).mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('executablePath');
    });

    it('should search platform-specific paths', async () => {
      const { existsSync } = await import('fs');
      const { access } = await import('fs/promises');
      
      // Mock a path that exists
      const existingPath = process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/google-chrome';
      
      vi.mocked(existsSync).mockImplementation((path: string) => path === existingPath);
      vi.mocked(access).mockResolvedValue(undefined);
      
      const instance = BrowserManager.getInstance();
      const url = 'http://example.com';
      mockBrowser.createPageWithUrl(url);
      
      await instance.getPage(url);
      
      expect(existsSync).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle browser launch failure', async () => {
      const puppeteer = await import('puppeteer');
      vi.mocked(puppeteer.default.launch).mockRejectedValue(new Error('Launch failed'));
      
      const instance = BrowserManager.getInstance();
      
      await expect(instance.getPage('http://example.com')).rejects.toThrow();
    });

    it('should handle page creation failure', async () => {
      const instance = BrowserManager.getInstance();
      mockBrowser = createMockBrowser();
      
      // Mock newPage to fail
      vi.spyOn(mockBrowser, 'newPage').mockRejectedValue(new Error('Page creation failed'));
      
      const puppeteer = await import('puppeteer');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser as unknown as Browser);
      
      await expect(instance.getPage('http://example.com')).rejects.toThrow();
    });
  });
});

