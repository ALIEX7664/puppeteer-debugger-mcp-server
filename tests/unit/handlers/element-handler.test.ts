import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElementHandler } from '../../../src/cdp-handlers/element-handler.js';
import { BrowserManager } from '../../../src/browser-manager.js';
import { MockPage, createMockPage } from '../../helpers/mock-browser.js';

// Mock BrowserManager
vi.mock('../../../src/browser-manager.js', () => {
  return {
    BrowserManager: {
      getInstance: vi.fn(),
    },
  };
});

describe('ElementHandler', () => {
  let handler: ElementHandler;
  let mockBrowserManager: any;
  let mockPage: MockPage;

  beforeEach(() => {
    mockPage = createMockPage('http://example.com');
    mockBrowserManager = {
      getPage: vi.fn().mockResolvedValue(mockPage),
    };
    
    handler = new ElementHandler(mockBrowserManager as unknown as BrowserManager);
  });

  describe('checkElement', () => {
    it('should return null if element not found', async () => {
      mockPage.setWaitForSelectorResult('#nonexistent', false);
      
      const result = await handler.checkElement({
        selector: '#nonexistent',
        url: 'http://example.com',
      });

      expect(result).toBeNull();
    });

    it('should return element state if element exists', async () => {
      mockPage.setWaitForSelectorResult('#test', true);
      
      // Set evaluate result with a key that will match
      const elementState = {
        tagName: 'div',
        id: 'test',
        className: 'test-class',
        textContent: 'Test content',
        attributes: { id: 'test', class: 'test-class' },
        styles: { display: 'block' },
        visible: true,
        clickable: true,
        boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      };
      
      // Use a key that will be matched by the mock
      mockPage.setEvaluateResult('selector', elementState);
      
      const result = await handler.checkElement({
        selector: '#test',
        url: 'http://example.com',
      });

      expect(result).not.toBeNull();
      expect(result?.tagName).toBe('div');
      expect(result?.id).toBe('test');
    });

    it('should handle multiple elements', async () => {
      mockPage.setWaitForSelectorResult('.item', true);
      mockPage.setEvaluateResult(
        'function(selector) { return { tagName: "div" }; }',
        {
          tagName: 'div',
          visible: true,
          clickable: true,
          attributes: {},
          styles: {},
          boundingBox: { x: 0, y: 0, width: 100, height: 50 },
        }
      );
      
      const results = await handler.checkElements(
        ['.item1', '.item2'],
        'http://example.com'
      );

      expect(results).toHaveProperty('.item1');
      expect(results).toHaveProperty('.item2');
    });
  });
});

