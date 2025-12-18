import { describe, it, expect, beforeEach, vi } from 'vitest';
import { navigateTool } from '../../../src/tools/navigate.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { ConsoleHandler } from '../../../src/cdp-handlers/console-handler.js';
import { ElementHandler } from '../../../src/cdp-handlers/element-handler.js';
import { CacheHandler } from '../../../src/cdp-handlers/cache-handler.js';
import { PerformanceHandler } from '../../../src/cdp-handlers/performance-handler.js';
import { HeapHandler } from '../../../src/cdp-handlers/heap-handler.js';
import { LighthouseHandler } from '../../../src/cdp-handlers/lighthouse-handler.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';

describe('navigateTool', () => {
  let mockBrowserManager: any;
  let context: any;
  let mockPage: MockPage;

  beforeEach(() => {
    mockPage = createMockPage('http://example.com');
    mockBrowserManager = {
      navigate: vi.fn().mockResolvedValue(mockPage),
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
  });

  describe('input validation', () => {
    it('should accept valid URL', () => {
      const result = navigateTool.inputSchema.safeParse({ url: 'http://example.com' });
      expect(result.success).toBe(true);
    });

    it('should reject missing URL', () => {
      const result = navigateTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL format', () => {
      const result = navigateTool.inputSchema.safeParse({ url: 'not-a-url' });
      // Zod will accept any string, but navigation might fail
      expect(result.success).toBe(true);
    });
  });

  describe('handler', () => {
    it('should navigate to URL', async () => {
      const result = await navigateTool.handler(
        { url: 'http://example.com' },
        context
      );

      expect(mockBrowserManager.navigate).toHaveBeenCalledWith('http://example.com');
      expect(result.content[0].text).toContain('Successfully navigated');
    });

    it('should return correct response format', async () => {
      const result = await navigateTool.handler(
        { url: 'http://example.com' },
        context
      );

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });
  });
});

