import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../src/browser-manager.js';
import { ConsoleHandler } from '../../src/cdp-handlers/console-handler.js';
import { ElementHandler } from '../../src/cdp-handlers/element-handler.js';
import { navigateTool } from '../../src/tools/navigate.js';
import { getConsoleErrorsTool } from '../../src/tools/get-console-errors.js';
import { checkElementTool } from '../../src/tools/check-element.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tool Call Flow Integration', () => {
  let browserManager: BrowserManager;
  let consoleHandler: ConsoleHandler;
  let elementHandler: ElementHandler;
  let testPageUrl: string;

  beforeAll(async () => {
    // Reset singleton
    (BrowserManager as any).instance = undefined;
    browserManager = BrowserManager.getInstance();
    
    consoleHandler = new ConsoleHandler(browserManager);
    elementHandler = new ElementHandler(browserManager);
    
    // Use a simple test URL (in real scenario, you'd serve the test page)
    testPageUrl = 'data:text/html,<html><body><div id="test">Test</div><script>console.error("Test error");</script></body></html>';
  });

  afterAll(async () => {
    if (browserManager.isInitialized()) {
      await browserManager.close();
    }
  });

  describe('Complete Tool Call Flow', () => {
    it('should navigate and check console errors', async () => {
      // Navigate
      const navigateResult = await navigateTool.handler(
        { url: testPageUrl },
        {
          browserManager,
          consoleHandler,
          elementHandler,
          cacheHandler: {} as any,
          performanceHandler: {} as any,
          heapHandler: {} as any,
          lighthouseHandler: {} as any,
        }
      );
      
      expect(navigateResult.content[0].text).toContain('Successfully navigated');
      
      // Wait a bit for console events
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get console errors
      const consoleResult = await getConsoleErrorsTool.handler(
        { url: testPageUrl, level: 'error' },
        {
          browserManager,
          consoleHandler,
          elementHandler,
          cacheHandler: {} as any,
          performanceHandler: {} as any,
          heapHandler: {} as any,
          lighthouseHandler: {} as any,
        }
      );
      
      const logs = JSON.parse(consoleResult.content[0].text);
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should navigate and check element', async () => {
      // Navigate
      await navigateTool.handler(
        { url: testPageUrl },
        {
          browserManager,
          consoleHandler,
          elementHandler,
          cacheHandler: {} as any,
          performanceHandler: {} as any,
          heapHandler: {} as any,
          lighthouseHandler: {} as any,
        }
      );
      
      // Check element
      const elementResult = await checkElementTool.handler(
        { selector: '#test', url: testPageUrl },
        {
          browserManager,
          consoleHandler,
          elementHandler,
          cacheHandler: {} as any,
          performanceHandler: {} as any,
          heapHandler: {} as any,
          lighthouseHandler: {} as any,
        }
      );
      
      expect(elementResult.content[0].text).toContain('tagName');
    });

    it('should handle multiple sequential tool calls', async () => {
      const context = {
        browserManager,
        consoleHandler,
        elementHandler,
        cacheHandler: {} as any,
        performanceHandler: {} as any,
        heapHandler: {} as any,
        lighthouseHandler: {} as any,
      };
      
      // Sequence: navigate -> check element -> get console errors
      await navigateTool.handler({ url: testPageUrl }, context);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const elementResult = await checkElementTool.handler(
        { selector: '#test', url: testPageUrl },
        context
      );
      expect(elementResult.content[0].text).not.toContain('not found');
      
      const consoleResult = await getConsoleErrorsTool.handler(
        { url: testPageUrl },
        context
      );
      expect(consoleResult.content[0].text).toBeDefined();
    });
  });
});

