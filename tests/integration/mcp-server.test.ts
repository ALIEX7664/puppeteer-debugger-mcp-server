import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../src/browser-manager.js';

describe('MCP Server Integration', () => {
  let browserManager: BrowserManager;

  beforeAll(async () => {
    // Reset singleton
    (BrowserManager as any).instance = undefined;
    browserManager = BrowserManager.getInstance();
  });

  afterAll(async () => {
    if (browserManager.isInitialized()) {
      await browserManager.close();
    }
  });

  describe('Server Initialization', () => {
    it('should initialize server', () => {
      // Note: DebuggerMCPServer is not exported, so we test indirectly
      // through BrowserManager initialization
      expect(browserManager).toBeDefined();
      expect(browserManager.isInitialized()).toBe(false);
    });

    it('should initialize browser on first use', async () => {
      const page = await browserManager.getPage('http://example.com');
      expect(page).toBeDefined();
      expect(browserManager.isInitialized()).toBe(true);
    });
  });

  describe('Browser Management', () => {
    it('should manage multiple pages', async () => {
      const url1 = 'http://example.com/page1';
      const url2 = 'http://example.com/page2';
      
      const page1 = await browserManager.getPage(url1);
      const page2 = await browserManager.getPage(url2);
      
      expect(page1).toBeDefined();
      expect(page2).toBeDefined();
      expect(page1).not.toBe(page2);
    });

    it('should reuse pages for same URL', async () => {
      const url = 'http://example.com/reuse';
      
      const page1 = await browserManager.getPage(url);
      const page2 = await browserManager.getPage(url);
      
      expect(page1).toBe(page2);
    });
  });

  describe('Cleanup', () => {
    it('should close browser gracefully', async () => {
      await browserManager.close();
      expect(browserManager.isInitialized()).toBe(false);
    });
  });
});

