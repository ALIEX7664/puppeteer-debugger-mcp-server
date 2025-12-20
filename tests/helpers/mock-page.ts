import { Page, CDPSession, Target } from 'puppeteer';
import type { ConsoleMessage, HTTPRequest } from 'puppeteer';

/**
 * Mock Page 实现
 * 注意：不直接实现 Page 接口以避免类型冲突，使用类型断言在需要时转换
 */
export class MockPage {
  private _url: string = 'about:blank';
  private _closed: boolean = false;
  private _consoleListeners: Array<(msg: ConsoleMessage) => void> = [];
  private _pageErrorListeners: Array<(error: Error) => void> = [];
  private _requestFailedListeners: Array<(request: HTTPRequest) => void> = [];
  private _closeListeners: Array<() => void> = [];
  private _evaluateResults: Map<string, any> = new Map();
  private _waitForSelectorResults: Map<string, boolean> = new Map();
  private _cdpHeapSnapshotRawJson?: string;
  private _cdpHeapSnapshotChunks?: string[];
  private _lastCDPSession?: any;

  constructor(url?: string) {
    if (url) {
      this._url = url;
    }
  }

  url(): string {
    return this._url;
  }

  async goto(url: string, options?: any): Promise<any> {
    this._url = url;
    return { response: { status: () => 200 } };
  }

  async evaluate<T = any>(fn: string | ((...args: any[]) => T), ...args: any[]): Promise<T> {
    // Try to find result by function string representation
    const fnStr = typeof fn === 'string' ? fn : fn.toString();

    // Also try with args for more specific matching
    const keyWithArgs = `${fnStr}::${JSON.stringify(args)}`;

    if (this._evaluateResults.has(keyWithArgs)) {
      return this._evaluateResults.get(keyWithArgs);
    }

    if (this._evaluateResults.has(fnStr)) {
      return this._evaluateResults.get(fnStr);
    }

    // Try to match by key patterns
    for (const [key, value] of this._evaluateResults.entries()) {
      // Match element handler (has selector parameter)
      if (args.length > 0 && (key.includes('selector') || key === 'selector')) {
        return value;
      }
      // Match performance handler (no args, has performance keyword)
      if (args.length === 0 && (key.includes('performance') || key === 'performance')) {
        return value;
      }
      // Match any key if it's a simple string key
      if (typeof key === 'string' && key.length < 50) {
        return value;
      }
    }

    // 默认返回空对象
    return {} as T;
  }

  async waitForSelector(selector: string, options?: any): Promise<any> {
    const result = this._waitForSelectorResults.get(selector);
    if (result === false) {
      throw new Error(`Element not found: ${selector}`);
    }
    return { asElement: () => null };
  }

  async setViewport(viewport: { width: number; height: number }): Promise<void> {
    // Mock implementation
  }

  async screenshot(options?: any): Promise<Buffer | string> {
    if (options?.encoding === 'base64') {
      return Buffer.from('mock-screenshot').toString('base64');
    }
    return Buffer.from('mock-screenshot');
  }

  async cookies(...urls: string[]): Promise<any[]> {
    return [];
  }

  isClosed(): boolean {
    return this._closed;
  }

  on(event: 'console', handler: (msg: ConsoleMessage) => void): Page;
  on(event: 'pageerror', handler: (error: Error) => void): Page;
  on(event: 'requestfailed', handler: (request: HTTPRequest) => void): Page;
  on(event: 'close', handler: () => void): Page;
  on(event: string, handler: (...args: any[]) => void): Page {
    if (event === 'console') {
      this._consoleListeners.push(handler);
    } else if (event === 'pageerror') {
      this._pageErrorListeners.push(handler);
    } else if (event === 'requestfailed') {
      this._requestFailedListeners.push(handler);
    } else if (event === 'close') {
      this._closeListeners.push(handler);
    }
    return this as unknown as Page;
  }

  once(event: 'console', handler: (msg: ConsoleMessage) => void): Page;
  once(event: 'pageerror', handler: (error: Error) => void): Page;
  once(event: 'requestfailed', handler: (request: HTTPRequest) => void): Page;
  once(event: 'close', handler: () => void): Page;
  once(event: string, handler: (...args: any[]) => void): Page {
    const wrappedHandler = (...args: any[]) => {
      handler(...args);
      this.removeListener(event, wrappedHandler);
    };
    // Use type assertion to call on with string event
    return (this.on as any)(event, wrappedHandler);
  }

  removeListener(event: string, handler: (...args: any[]) => void): Page {
    if (event === 'console') {
      this._consoleListeners = this._consoleListeners.filter((h) => h !== handler);
    } else if (event === 'pageerror') {
      this._pageErrorListeners = this._pageErrorListeners.filter((h) => h !== handler);
    } else if (event === 'requestfailed') {
      this._requestFailedListeners = this._requestFailedListeners.filter((h) => h !== handler);
    } else if (event === 'close') {
      this._closeListeners = this._closeListeners.filter((h) => h !== handler);
    }
    return this as unknown as Page;
  }

  async close(): Promise<void> {
    this._closed = true;
    this._closeListeners.forEach((handler) => handler());
  }

  target(): Target {
    return {
      createCDPSession: async () => this.createCDPSession(),
    } as Target;
  }

  async createCDPSession(): Promise<CDPSession> {
    const session = new MockCDPSession({
      heapSnapshotRawJson: this._cdpHeapSnapshotRawJson,
      heapSnapshotChunks: this._cdpHeapSnapshotChunks,
    });
    this._lastCDPSession = session;
    return session as unknown as CDPSession;
  }

  // Helper methods for testing
  setEvaluateResult(key: string, result: any): void {
    this._evaluateResults.set(key, result);
  }

  setWaitForSelectorResult(selector: string, exists: boolean): void {
    this._waitForSelectorResults.set(selector, exists);
  }

  /**
   * 设置下次 HeapProfiler.takeHeapSnapshot 的输出（raw JSON）。
   * 会在 send('HeapProfiler.takeHeapSnapshot') 时拆分为 chunk 事件发出。
   */
  setHeapSnapshotRawJson(rawJson: string): void {
    this._cdpHeapSnapshotRawJson = rawJson;
    this._cdpHeapSnapshotChunks = undefined;
  }

  /**
   * 设置下次 HeapProfiler.takeHeapSnapshot 的输出 chunks。
   */
  setHeapSnapshotChunks(chunks: string[]): void {
    this._cdpHeapSnapshotChunks = chunks;
    this._cdpHeapSnapshotRawJson = undefined;
  }

  /**
   * 获取最近一次创建的 CDP Session（用于断言/调试）
   */
  getLastCDPSession(): any {
    return this._lastCDPSession;
  }

  triggerConsole(type: string, text: string): void {
    const mockMsg = {
      type: () => type,
      text: () => text,
      location: () => ({ url: this._url, lineNumber: 1, columnNumber: 1 }),
    } as ConsoleMessage;
    this._consoleListeners.forEach((handler) => handler(mockMsg));
  }

  triggerPageError(error: Error): void {
    this._pageErrorListeners.forEach((handler) => handler(error));
  }

  triggerRequestFailed(url: string): void {
    const mockRequest = {
      url: () => url,
    } as HTTPRequest;
    this._requestFailedListeners.forEach((handler) => handler(mockRequest));
  }
}

/**
 * Mock CDP Session
 * 注意：不直接实现 CDPSession 接口以避免类型冲突
 */
class MockCDPSession {
  private _sentCommands: Array<{ method: string; params?: any }> = [];
  private _listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private _heapSnapshotRawJson?: string;
  private _heapSnapshotChunks?: string[];

  constructor(opts?: { heapSnapshotRawJson?: string; heapSnapshotChunks?: string[] }) {
    this._heapSnapshotRawJson = opts?.heapSnapshotRawJson;
    this._heapSnapshotChunks = opts?.heapSnapshotChunks;
  }

  on(event: string, handler: (...args: any[]) => void): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(handler);
    return this;
  }

  removeListener(event: string, handler: (...args: any[]) => void): this {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(handler);
    }
    return this;
  }

  private emit(event: string, payload: any): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch {
        // ignore
      }
    }
  }

  async send(method: string, params?: any): Promise<any> {
    this._sentCommands.push({ method, params });

    // Return mock responses based on method
    if (method === 'Performance.enable') {
      return {};
    }
    if (method === 'Performance.getMetrics') {
      return { metrics: [] };
    }
    if (method === 'DOM.getDocument') {
      return { root: { nodeId: 1 } };
    }
    if (method === 'DOM.querySelector') {
      return { nodeId: 2 };
    }
    if (method === 'HeapProfiler.enable') {
      return {};
    }
    if (method === 'HeapProfiler.startTrackingHeapObjects') {
      return {};
    }
    if (method === 'HeapProfiler.stopTrackingHeapObjects') {
      return {};
    }
    if (method === 'HeapProfiler.takeHeapSnapshot') {
      // Simulate heap snapshot chunk streaming
      const chunks =
        this._heapSnapshotChunks ??
        (this._heapSnapshotRawJson ? [this._heapSnapshotRawJson] : []);

      if (chunks.length > 0) {
        let done = 0;
        const total = chunks.reduce((sum, c) => sum + c.length, 0);
        for (const chunk of chunks) {
          this.emit('HeapProfiler.addHeapSnapshotChunk', { chunk });
          done += chunk.length;
          this.emit('HeapProfiler.reportHeapSnapshotProgress', {
            done,
            total,
            finished: false,
          });
        }
        this.emit('HeapProfiler.reportHeapSnapshotProgress', {
          done: total,
          total,
          finished: true,
        });
      }
      return {};
    }
    if (method === 'HeapProfiler.collectGarbage') {
      return {};
    }
    if (method === 'HeapProfiler.getHeapObjectId') {
      return { heapSnapshotObjectId: '1' };
    }
    if (method === 'Runtime.getHeapUsage') {
      return { usedSize: 1000000, totalSize: 2000000 };
    }
    if (method === 'Network.enable') {
      return {};
    }
    if (method === 'Network.getCookies') {
      return { cookies: [] };
    }
    if (method === 'Runtime.evaluate') {
      return { result: { value: {} } };
    }

    return {};
  }

  async detach(): Promise<void> {
    // Mock implementation
  }

  getSentCommands(): Array<{ method: string; params?: any }> {
    return this._sentCommands;
  }
}

