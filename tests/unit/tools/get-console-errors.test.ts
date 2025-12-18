import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConsoleErrorsTool } from '../../../src/tools/get-console-errors.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { ConsoleHandler } from '../../../src/cdp-handlers/console-handler.js';
import { ElementHandler } from '../../../src/cdp-handlers/element-handler.js';
import { CacheHandler } from '../../../src/cdp-handlers/cache-handler.js';
import { PerformanceHandler } from '../../../src/cdp-handlers/performance-handler.js';
import { HeapHandler } from '../../../src/cdp-handlers/heap-handler.js';
import { LighthouseHandler } from '../../../src/cdp-handlers/lighthouse-handler.js';

describe('getConsoleErrorsTool', () => {
  let mockConsoleHandler: any;
  let context: any;

  beforeEach(() => {
    mockConsoleHandler = {
      getConsoleErrors: vi.fn().mockResolvedValue([
        {
          type: 'error',
          text: 'Test error',
          timestamp: Date.now(),
        },
      ]),
    };
    
    context = {
      browserManager: {} as BrowserManager,
      consoleHandler: mockConsoleHandler,
      elementHandler: {} as ElementHandler,
      cacheHandler: {} as CacheHandler,
      performanceHandler: {} as PerformanceHandler,
      heapHandler: {} as HeapHandler,
      lighthouseHandler: {} as LighthouseHandler,
    };
  });

  describe('input validation', () => {
    it('should accept valid input with URL and level', () => {
      const result = getConsoleErrorsTool.inputSchema.safeParse({
        url: 'http://example.com',
        level: 'error',
      });
      expect(result.success).toBe(true);
    });

    it('should accept input without URL', () => {
      const result = getConsoleErrorsTool.inputSchema.safeParse({
        level: 'warning',
      });
      expect(result.success).toBe(true);
    });

    it('should default to "all" level', () => {
      const result = getConsoleErrorsTool.inputSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.level).toBe('all');
      }
    });

    it('should reject invalid level', () => {
      const result = getConsoleErrorsTool.inputSchema.safeParse({
        level: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('handler', () => {
    it('should call consoleHandler.getConsoleErrors', async () => {
      await getConsoleErrorsTool.handler(
        { url: 'http://example.com', level: 'error' },
        context
      );

      expect(mockConsoleHandler.getConsoleErrors).toHaveBeenCalledWith({
        url: 'http://example.com',
        level: 'error',
      });
    });

    it('should return formatted JSON response', async () => {
      const result = await getConsoleErrorsTool.handler(
        { url: 'http://example.com', level: 'error' },
        context
      );

      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockConsoleHandler.getConsoleErrors.mockRejectedValue(new Error('Test error'));
      
      await expect(
        getConsoleErrorsTool.handler(
          { url: 'http://example.com' },
          context
        )
      ).rejects.toThrow();
    });
  });
});

