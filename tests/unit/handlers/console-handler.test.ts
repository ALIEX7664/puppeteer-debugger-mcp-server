import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleHandler } from '../../../src/cdp-handlers/console-handler.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { MockBrowser, MockPage, createMockBrowser, createMockPage } from '../../helpers/mock-browser.js';

// Mock BrowserManager
vi.mock('../../../src/browser-manager.js', () => {
  return {
    BrowserManager: {
      getInstance: vi.fn(),
    },
  };
});

describe('ConsoleHandler', () => {
  let handler: ConsoleHandler;
  let mockBrowserManager: any;
  let mockPage: MockPage;

  beforeEach(() => {
    mockPage = createMockPage('http://example.com');
    mockBrowserManager = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    };
    
    handler = new ConsoleHandler(mockBrowserManager as unknown as BrowserManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getConsoleErrors', () => {
    it('should collect console logs', async () => {
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      expect(result).toEqual([]);
      expect(mockBrowserManager.getPage).toHaveBeenCalledWith('http://example.com');
    });

    it('should filter errors only', async () => {
      // First call to setup listener
      await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });
      
      // Then trigger console event
      mockPage.triggerConsole('error', 'Test error');
      
      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'error',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((log) => log.type === 'error')).toBe(true);
    });

    it('should filter warnings and errors', async () => {
      // First call to setup listener
      await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });
      
      // Then trigger console events
      mockPage.triggerConsole('warning', 'Test warning');
      mockPage.triggerConsole('error', 'Test error');
      
      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'warning',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((log) => log.type === 'error' || log.type === 'warning')).toBe(true);
    });

    it('should setup console listener on first call', async () => {
      await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      // Trigger console event
      mockPage.triggerConsole('log', 'Test log');
      
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle page errors', async () => {
      await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      const error = new Error('Page error');
      mockPage.triggerPageError(error);
      
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'error',
      });

      expect(result.some((log) => log.text.includes('Page error'))).toBe(true);
    });
  });

  describe('clearLogs', () => {
    it('should clear logs for specific URL', async () => {
      await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      mockPage.triggerConsole('error', 'Test error');
      handler.clearLogs('http://example.com');
      
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      expect(result.length).toBe(0);
    });

    it('should clear all logs', async () => {
      await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      mockPage.triggerConsole('error', 'Test error');
      handler.clearLogs();
      
      const result = await handler.getConsoleErrors({
        url: 'http://example.com',
        level: 'all',
      });

      expect(result.length).toBe(0);
    });
  });
});

