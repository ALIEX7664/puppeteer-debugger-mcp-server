import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheHandler } from '../../../src/cdp-handlers/cache-handler.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';

vi.mock('../../../src/browser-manager.js', () => {
  return {
    BrowserManager: {
      getInstance: vi.fn(),
    },
  };
});

describe('CacheHandler', () => {
  let handler: CacheHandler;
  let mockBrowserManager: any;
  let mockPage: MockPage;

  beforeEach(() => {
    mockPage = createMockPage('http://example.com');
    mockBrowserManager = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    };
    
    handler = new CacheHandler(mockBrowserManager as unknown as BrowserManager);
  });

  describe('getCacheStatus', () => {
    it('should get cache status', async () => {
      mockPage.setEvaluateResult(
        '() => ({})',
        { test: 'value' }
      );
      
      // Mock cookies
      vi.spyOn(mockPage, 'cookies').mockResolvedValue([]);
      
      const result = await handler.getCacheStatus({
        url: 'http://example.com',
      });

      expect(result).toHaveProperty('localStorage');
      expect(result).toHaveProperty('sessionStorage');
      expect(result).toHaveProperty('cookies');
    });
  });

  describe('clearLocalStorage', () => {
    it('should clear localStorage', async () => {
      await expect(
        handler.clearLocalStorage('http://example.com')
      ).resolves.not.toThrow();
    });
  });

  describe('clearSessionStorage', () => {
    it('should clear sessionStorage', async () => {
      await expect(
        handler.clearSessionStorage('http://example.com')
      ).resolves.not.toThrow();
    });
  });

  describe('clearCookies', () => {
    it('should clear cookies', async () => {
      await expect(
        handler.clearCookies('http://example.com')
      ).resolves.not.toThrow();
    });
  });
});

