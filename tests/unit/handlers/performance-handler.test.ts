import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceHandler } from '../../../src/cdp-handlers/performance-handler.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';

vi.mock('../../../src/browser-manager.js', () => {
  return {
    BrowserManager: {
      getInstance: vi.fn(),
    },
  };
});

describe('PerformanceHandler', () => {
  let handler: PerformanceHandler;
  let mockBrowserManager: any;
  let mockPage: MockPage;

  beforeEach(() => {
    mockPage = createMockPage('http://example.com');
    mockBrowserManager = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    };
    
    handler = new PerformanceHandler(mockBrowserManager as unknown as BrowserManager);
  });

  describe('getPerformance', () => {
    it('should get performance metrics', async () => {
      const performanceData = {
        navigation: {
          type: 'navigate',
          redirectCount: 0,
          timing: {
            navigationStart: 0,
            fetchStart: 100,
            domInteractive: 500,
            loadEventEnd: 1000,
          },
        },
        paint: [],
        resources: [],
        marks: [],
        measures: [],
      };
      
      // Set evaluate result with a key that will match
      mockPage.setEvaluateResult('performance', performanceData);
      
      const result = await handler.getPerformance({
        url: 'http://example.com',
      });

      expect(result).toHaveProperty('navigation');
      expect(result).toHaveProperty('paint');
      expect(result).toHaveProperty('resources');
    });
  });

  describe('getPerformanceSummary', () => {
    it('should get performance summary', async () => {
      const performanceData = {
        navigation: {
          type: 'navigate',
          redirectCount: 0,
          timing: {
            navigationStart: 0,
            fetchStart: 100,
            domInteractive: 500,
            loadEventEnd: 1000,
            domContentLoadedEventEnd: 600,
          },
        },
        paint: [],
        resources: [],
        marks: [],
        measures: [],
      };
      
      // Set evaluate result with a key that will match
      mockPage.setEvaluateResult('performance', performanceData);
      
      const result = await handler.getPerformanceSummary({
        url: 'http://example.com',
      });

      expect(result).toHaveProperty('loadTime');
      expect(result).toHaveProperty('domContentLoaded');
      expect(result).toHaveProperty('resourceCount');
    });
  });
});

