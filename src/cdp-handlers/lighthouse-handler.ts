import { Page, CDPSession } from 'puppeteer';
import { BrowserManager } from '../browser-manager.js';
import {
  GetLighthouseParams,
  LighthouseCategory,
  LighthouseMetrics,
  LighthouseAudit,
  LighthouseReport,
  WebVitalsMetrics,
  WebVitalsRatings,
  PerformanceMetrics,
} from './lighthouse-types.js';
import {
  WebVitalsRating,
  WEB_VITALS_THRESHOLDS,
  PERFORMANCE_THRESHOLDS,
  SCORING_THRESHOLDS,
  WAIT_TIMES,
  LIMITATIONS,
} from './lighthouse-constants.js';
import {
  calculateWebVitalsRatings,
  createPerformanceObserver,
} from './lighthouse-utils.js';

/**
 * Lighthouse 性能分析处理器（基于 Web Vitals 和 CDP）
 */
export class LighthouseHandler {
  private browserManager: BrowserManager;

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }

  /**
   * 获取 Lighthouse 性能报告
   */
  public async getLighthouseReport(
    params: GetLighthouseParams
  ): Promise<LighthouseReport> {
    const page = await this.browserManager.getPage(params.url);
    const client = await page.target().createCDPSession();

    try {
      // 启用必要的 CDP 域
      await client.send('Performance.enable');
      await client.send('Runtime.enable');
      await client.send('Page.enable');
      await client.send('Network.enable');

      // 改进页面加载等待逻辑
      await this.waitForPageLoad(page);

      // 收集 Web Vitals 指标
      const webVitals = await this.collectWebVitals(page);

      // 收集性能指标
      const performanceMetrics = await this.collectPerformanceMetrics(page, client);

      // 计算评分
      const scores = this.calculateScores(webVitals, performanceMetrics);

      // 获取优化建议和诊断信息（应用 skipAudits 过滤）
      const opportunities = await this.getOpportunities(
        page,
        client,
        webVitals,
        performanceMetrics,
        params.skipAudits
      );
      const diagnostics = await this.getDiagnostics(
        page,
        client,
        webVitals,
        performanceMetrics,
        params.skipAudits
      );

      const userAgent = await page.evaluate(() => navigator.userAgent);

      // 构建所有类别
      const allCategories = this.buildCategories(scores);

      // 应用 onlyCategories 过滤
      const filteredCategories = this.filterCategories(allCategories, params.onlyCategories);

      // 计算 Web Vitals 等级
      const ratings = calculateWebVitalsRatings(webVitals);

      return {
        url: page.url(),
        fetchTime: new Date().toISOString(),
        userAgent,
        categories: filteredCategories,
        metrics: {
          firstContentfulPaint: webVitals.fcp,
          largestContentfulPaint: webVitals.lcp,
          totalBlockingTime: performanceMetrics.tbt,
          cumulativeLayoutShift: webVitals.cls,
          speedIndex: performanceMetrics.speedIndex,
          timeToInteractive: performanceMetrics.tti,
          firstInputDelay: webVitals.fid,
          timeToFirstByte: webVitals.ttfb,
          ratings,
        },
        opportunities: opportunities.slice(0, 10),
        diagnostics: diagnostics.slice(0, 10),
        implementation: 'approximation',
        limitations: [...LIMITATIONS],
      };
    } finally {
      try {
        await client.detach();
      } catch (error) {
        // Ignore close errors
      }
    }
  }

  /**
   * 等待页面加载完成
   */
  private async waitForPageLoad(page: Page): Promise<void> {
    try {
      // 检查页面是否已经加载完成
      const pageState = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        return {
          readyState: document.readyState,
          hasNavigation: nav !== undefined,
          loadComplete: nav ? nav.loadEventEnd > 0 : false,
        };
      });

      if (pageState.readyState === 'complete' && pageState.hasNavigation && pageState.loadComplete) {
        await new Promise(resolve => setTimeout(resolve, WAIT_TIMES.METRICS_STABLE));
        return;
      }

      await Promise.race([
        page.evaluate(() => {
          return new Promise<void>((resolve) => {
            if (document.readyState === 'complete') {
              resolve();
            } else {
              window.addEventListener('load', () => resolve(), { once: true });
              setTimeout(() => resolve(), WAIT_TIMES.PAGE_LOAD_TIMEOUT);
            }
          });
        }),
        new Promise(resolve => setTimeout(resolve, WAIT_TIMES.PAGE_LOAD_TIMEOUT)),
      ]).catch(() => {
        // Ignore errors
      });

      await new Promise(resolve => setTimeout(resolve, WAIT_TIMES.METRICS_STABLE));
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, WAIT_TIMES.FALLBACK_DELAY));
    }
  }

  /**
   * 收集 Web Vitals 指标
   */
  private async collectWebVitals(page: Page): Promise<WebVitalsMetrics & { ratings?: WebVitalsRatings }> {
    const thresholds = {
      FCP: { GOOD: WEB_VITALS_THRESHOLDS.FCP.GOOD, NEEDS_IMPROVEMENT: WEB_VITALS_THRESHOLDS.FCP.NEEDS_IMPROVEMENT },
      LCP: { GOOD: WEB_VITALS_THRESHOLDS.LCP.GOOD, NEEDS_IMPROVEMENT: WEB_VITALS_THRESHOLDS.LCP.NEEDS_IMPROVEMENT },
      FID: { GOOD: WEB_VITALS_THRESHOLDS.FID.GOOD, NEEDS_IMPROVEMENT: WEB_VITALS_THRESHOLDS.FID.NEEDS_IMPROVEMENT },
      CLS: { GOOD: WEB_VITALS_THRESHOLDS.CLS.GOOD, NEEDS_IMPROVEMENT: WEB_VITALS_THRESHOLDS.CLS.NEEDS_IMPROVEMENT },
      TTFB: { GOOD: WEB_VITALS_THRESHOLDS.TTFB.GOOD, NEEDS_IMPROVEMENT: WEB_VITALS_THRESHOLDS.TTFB.NEEDS_IMPROVEMENT },
    };
    const waitTimes = {
      SHORT: WAIT_TIMES.METRICS_COLLECTION_SHORT,
      LONG: WAIT_TIMES.METRICS_COLLECTION_LONG,
    };
    const ratingValues = {
      GOOD: WebVitalsRating.GOOD,
      NEEDS_IMPROVEMENT: WebVitalsRating.NEEDS_IMPROVEMENT,
      POOR: WebVitalsRating.POOR,
    };

    return await page.evaluate(
      (thresholds: any, waitTimes: any, ratingValues: any) => {
        return new Promise<WebVitalsMetrics & { ratings?: WebVitalsRatings }>((resolve) => {
          const metrics: WebVitalsMetrics = {
            fcp: null,
            lcp: null,
            fid: null,
            cls: 0,
            ttfb: null,
          };

          // 创建 PerformanceObserver 的辅助函数（浏览器环境）
          const createObserver = (
            entryTypes: string[],
            callback: (entries: PerformanceEntry[]) => void,
            buffered = true
          ): PerformanceObserver | null => {
            try {
              const observer = new PerformanceObserver((list) => {
                callback(Array.from(list.getEntries()));
              });
              const options: PerformanceObserverInit = { entryTypes };
              if (buffered) {
                (options as any).buffered = true;
              }
              observer.observe(options);
              return observer;
            } catch (error) {
              if (buffered) {
                try {
                  const observer = new PerformanceObserver((list) => {
                    callback(Array.from(list.getEntries()));
                  });
                  observer.observe({ entryTypes });
                  return observer;
                } catch {
                  return null;
                }
              }
              return null;
            }
          };

          // FCP (First Contentful Paint)
          const fcpObserver = createObserver(
            ['paint'],
            (entries) => {
              for (const entry of entries) {
                if (entry.name === 'first-contentful-paint') {
                  metrics.fcp = entry.startTime;
                  fcpObserver?.disconnect();
                }
              }
            }
          );

          // LCP (Largest Contentful Paint)
          let lcpEntries: any[] = [];
          const lcpObserver = createObserver(
            ['largest-contentful-paint'],
            (entries) => {
              lcpEntries.push(...entries);
              if (lcpEntries.length > 0) {
                const lastEntry = lcpEntries[lcpEntries.length - 1];
                metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
              }
            }
          );

          // CLS (Cumulative Layout Shift)
          let clsValue = 0;
          const clsObserver = createObserver(
            ['layout-shift'],
            (entries) => {
              for (const entry of entries as any[]) {
                if (!entry.hadRecentInput) {
                  clsValue += entry.value;
                }
              }
              metrics.cls = clsValue;
            }
          );

          // FID (First Input Delay) - 只监听 first-input
          const fidObserver = createObserver(
            ['first-input'],
            (entries) => {
              for (const entry of entries as any[]) {
                if (entry.entryType === 'first-input') {
                  metrics.fid = entry.processingStart - entry.startTime;
                  fidObserver?.disconnect();
                  break;
                }
              }
            }
          );

          // TTFB (Time to First Byte)
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation && navigation.responseStart > 0) {
            metrics.ttfb = navigation.responseStart - navigation.fetchStart;
          }

          // 检测 LCP 是否稳定（页面卸载时停止更新）
          window.addEventListener('beforeunload', () => {
            if (lcpEntries.length > 0) {
              const lastEntry = lcpEntries[lcpEntries.length - 1];
              metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
            }
          }, { once: true });

          // 计算等级
          const getRating = {
            lcp: (v: number) => v <= thresholds.LCP.GOOD ? ratingValues.GOOD : v <= thresholds.LCP.NEEDS_IMPROVEMENT ? ratingValues.NEEDS_IMPROVEMENT : ratingValues.POOR,
            fid: (v: number) => v <= thresholds.FID.GOOD ? ratingValues.GOOD : v <= thresholds.FID.NEEDS_IMPROVEMENT ? ratingValues.NEEDS_IMPROVEMENT : ratingValues.POOR,
            cls: (v: number) => v <= thresholds.CLS.GOOD ? ratingValues.GOOD : v <= thresholds.CLS.NEEDS_IMPROVEMENT ? ratingValues.NEEDS_IMPROVEMENT : ratingValues.POOR,
            fcp: (v: number) => v <= thresholds.FCP.GOOD ? ratingValues.GOOD : v <= thresholds.FCP.NEEDS_IMPROVEMENT ? ratingValues.NEEDS_IMPROVEMENT : ratingValues.POOR,
            ttfb: (v: number) => v <= thresholds.TTFB.GOOD ? ratingValues.GOOD : v <= thresholds.TTFB.NEEDS_IMPROVEMENT ? ratingValues.NEEDS_IMPROVEMENT : ratingValues.POOR,
          };

          const ratings: any = {};
          if (metrics.fcp !== null) ratings.fcp = getRating.fcp(metrics.fcp);
          if (metrics.lcp !== null) ratings.lcp = getRating.lcp(metrics.lcp);
          if (metrics.fid !== null) ratings.fid = getRating.fid(metrics.fid);
          if (metrics.cls > 0) ratings.cls = getRating.cls(metrics.cls);
          if (metrics.ttfb !== null) ratings.ttfb = getRating.ttfb(metrics.ttfb);

          const hasMetrics = metrics.fcp !== null || metrics.lcp !== null || metrics.ttfb !== null;
          const waitTime = hasMetrics ? waitTimes.SHORT : waitTimes.LONG;

          setTimeout(() => {
            resolve({ ...metrics, ratings });
          }, waitTime);
        });
      },
      thresholds,
      waitTimes,
      ratingValues
    );
  }

  /**
   * 收集性能指标
   */
  private async collectPerformanceMetrics(page: Page, client: CDPSession): Promise<PerformanceMetrics> {
    const longTaskDuration = PERFORMANCE_THRESHOLDS.LONG_TASK_DURATION;
    const waitTimes = {
      SHORT: WAIT_TIMES.METRICS_COLLECTION_SHORT,
      LONG: WAIT_TIMES.METRICS_COLLECTION_LONG,
    };

    // 获取长任务来计算 TBT
    const longTasks = await page.evaluate(
      (longTaskDuration: number, waitTimes: any) => {
        return new Promise<number>((resolve) => {
          let tbt = 0;

          // 创建 PerformanceObserver 的辅助函数（浏览器环境）
          const createObserver = (
            entryTypes: string[],
            callback: (entries: PerformanceEntry[]) => void,
            buffered = true
          ): PerformanceObserver | null => {
            try {
              const observer = new PerformanceObserver((list) => {
                callback(Array.from(list.getEntries()));
              });
              const options: PerformanceObserverInit = { entryTypes };
              if (buffered) {
                (options as any).buffered = true;
              }
              observer.observe(options);
              return observer;
            } catch (error) {
              if (buffered) {
                try {
                  const observer = new PerformanceObserver((list) => {
                    callback(Array.from(list.getEntries()));
                  });
                  observer.observe({ entryTypes });
                  return observer;
                } catch {
                  return null;
                }
              }
              return null;
            }
          };

          const observer = createObserver(
            ['longtask'],
            (entries) => {
              for (const entry of entries as any[]) {
                if (entry.duration > longTaskDuration) {
                  tbt += entry.duration - longTaskDuration;
                }
              }
            }
          );

          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const hasMetrics = nav !== undefined;
          const waitTime = hasMetrics ? waitTimes.SHORT : waitTimes.LONG;

          setTimeout(() => {
            observer?.disconnect();
            resolve(tbt);
          }, waitTime);
        });
      },
      longTaskDuration,
      waitTimes
    );

    // 计算 TTI (Time to Interactive)
    const navigation = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (nav) {
        return nav.domInteractive - nav.fetchStart;
      }
      return 0;
    });

    // 计算 Speed Index (简化版，基于 DOMContentLoaded)
    const speedIndex = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (nav) {
        return nav.domContentLoadedEventEnd - nav.fetchStart;
      }
      return 0;
    });

    return {
      tbt: longTasks,
      tti: navigation,
      speedIndex,
    };
  }

  /**
   * 计算评分
   */
  private calculateScores(
    webVitals: WebVitalsMetrics,
    performance: PerformanceMetrics
  ): {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  } {
    let perfScore = 100;

    if (webVitals.fcp !== null) {
      if (webVitals.fcp > SCORING_THRESHOLDS.FCP.EXCELLENT) perfScore -= 10;
      if (webVitals.fcp > SCORING_THRESHOLDS.FCP.GOOD) perfScore -= 40;
      if (webVitals.fcp > SCORING_THRESHOLDS.FCP.FAIR) perfScore -= 50;
    }

    if (webVitals.lcp !== null) {
      if (webVitals.lcp > SCORING_THRESHOLDS.LCP.EXCELLENT) perfScore -= 15;
      if (webVitals.lcp > SCORING_THRESHOLDS.LCP.GOOD) perfScore -= 60;
    }

    if (webVitals.cls > SCORING_THRESHOLDS.CLS.EXCELLENT) perfScore -= 30;
    if (webVitals.cls > SCORING_THRESHOLDS.CLS.GOOD) perfScore -= 20;

    if (performance.tbt > SCORING_THRESHOLDS.TBT.EXCELLENT) perfScore -= 30;
    if (performance.tbt > SCORING_THRESHOLDS.TBT.GOOD) perfScore -= 20;

    if (performance.tti > PERFORMANCE_THRESHOLDS.TTI.WARNING) perfScore -= 10;
    if (performance.tti > PERFORMANCE_THRESHOLDS.TTI.CRITICAL) perfScore -= 10;

    perfScore = Math.max(0, Math.min(100, perfScore));

    // 可访问性评分（简化版，基于基本检查）
    let a11yScore = 100;
    // 可以通过 CDP Accessibility API 获取更准确的评分
    // 这里使用占位符
    a11yScore = 85;

    // 最佳实践评分（简化版）
    let bestPracticesScore = 100;
    // 检查 HTTPS
    // 检查控制台错误等
    bestPracticesScore = 90;

    // SEO 评分（简化版）
    let seoScore = 100;
    // 检查 meta 标签等
    seoScore = 80;

    return {
      performance: Math.round(perfScore),
      accessibility: a11yScore,
      bestPractices: bestPracticesScore,
      seo: seoScore,
    };
  }

  /**
   * 构建类别对象
   */
  private buildCategories(scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  }): Record<string, LighthouseCategory> {
    return {
      performance: { score: scores.performance, title: 'Performance' },
      accessibility: { score: scores.accessibility, title: 'Accessibility' },
      'best-practices': { score: scores.bestPractices, title: 'Best Practices' },
      seo: { score: scores.seo, title: 'SEO' },
    };
  }

  /**
   * 过滤类别
   */
  private filterCategories(
    allCategories: Record<string, LighthouseCategory>,
    onlyCategories?: string[]
  ): LighthouseReport['categories'] {
    if (!onlyCategories || onlyCategories.length === 0) {
      return allCategories as LighthouseReport['categories'];
    }

    const filtered: LighthouseReport['categories'] = {};
    const validCategories: Array<keyof LighthouseReport['categories']> = [
      'performance',
      'accessibility',
      'best-practices',
      'seo',
    ];

    for (const category of onlyCategories) {
      if (validCategories.includes(category as keyof LighthouseReport['categories'])) {
        const key = category as keyof LighthouseReport['categories'];
        if (category in allCategories) {
          filtered[key] = allCategories[category] as LighthouseCategory;
        }
      }
    }
    return filtered;
  }

  /**
   * 获取优化建议
   */
  private async getOpportunities(
    page: Page,
    client: CDPSession,
    webVitals: WebVitalsMetrics,
    performance: PerformanceMetrics,
    skipAudits?: string[]
  ): Promise<LighthouseAudit[]> {
    const opportunities = [];

    // 检查图片优化
    const images = await page.evaluate(() => {
      return Array.from(document.images).map(img => ({
        src: img.src,
        naturalWidth: img.naturalWidth,
        width: img.width,
        height: img.height,
        loading: (img as any).loading || 'eager',
      }));
    });

    for (const img of images) {
      if (img.naturalWidth > img.width * 2) {
        opportunities.push({
          id: 'uses-optimized-images',
          title: 'Serve images in next-gen formats',
          description: `Image is ${Math.round((img.naturalWidth / img.width) * 100)}% larger than displayed`,
          score: 0.7,
          numericValue: img.naturalWidth - img.width,
          displayValue: `${Math.round((img.naturalWidth / img.width) * 100)}% larger`,
        });
      }
      if (img.loading === 'eager' && images.indexOf(img) > 2) {
        opportunities.push({
          id: 'offscreen-images',
          title: 'Defer offscreen images',
          description: 'Consider lazy-loading images below the fold',
          score: 0.8,
        });
      }
    }

    // 检查未压缩的资源
    if (webVitals.ttfb && webVitals.ttfb > WEB_VITALS_THRESHOLDS.TTFB.GOOD) {
      opportunities.push({
        id: 'render-blocking-resources',
        title: 'Reduce server response times',
        description: `Time to First Byte is ${Math.round(webVitals.ttfb)}ms`,
        score: 0.6,
        numericValue: webVitals.ttfb,
        displayValue: `${Math.round(webVitals.ttfb)}ms`,
      });
    }

    // 检查阻塞渲染的资源
    if (webVitals.fcp && webVitals.fcp > WEB_VITALS_THRESHOLDS.FCP.GOOD) {
      opportunities.push({
        id: 'render-blocking-resources',
        title: 'Eliminate render-blocking resources',
        description: 'First Contentful Paint is slow',
        score: 0.7,
        numericValue: webVitals.fcp,
        displayValue: `${Math.round(webVitals.fcp)}ms`,
      });
    }

    // 应用 skipAudits 过滤
    if (skipAudits && skipAudits.length > 0) {
      return opportunities.filter(opp => !skipAudits.includes(opp.id));
    }

    return opportunities;
  }

  /**
   * 获取诊断信息
   */
  private async getDiagnostics(
    page: Page,
    client: CDPSession,
    webVitals: WebVitalsMetrics,
    performance: PerformanceMetrics,
    skipAudits?: string[]
  ): Promise<LighthouseAudit[]> {
    const diagnostics = [];

    // 诊断信息
    if (webVitals.fcp && webVitals.fcp > SCORING_THRESHOLDS.FCP.GOOD) {
      diagnostics.push({
        id: 'render-blocking-resources',
        title: 'Reduce render-blocking resources',
        description: 'First Contentful Paint is slow',
        score: 0.5,
      });
    }

    if (webVitals.lcp && webVitals.lcp > SCORING_THRESHOLDS.LCP.GOOD) {
      diagnostics.push({
        id: 'largest-contentful-paint-element',
        title: 'Largest Contentful Paint element',
        description: 'LCP is above 4 seconds',
        score: 0.4,
      });
    }

    if (webVitals.cls > WEB_VITALS_THRESHOLDS.CLS.NEEDS_IMPROVEMENT) {
      diagnostics.push({
        id: 'layout-shift-elements',
        title: 'Avoid large layout shifts',
        description: 'Cumulative Layout Shift is high',
        score: 0.3,
      });
    }

    if (performance.tbt > SCORING_THRESHOLDS.TBT.GOOD) {
      diagnostics.push({
        id: 'long-tasks',
        title: 'Minimize main-thread work',
        description: 'Total Blocking Time is high',
        score: 0.4,
      });
    }

    // 应用 skipAudits 过滤
    if (skipAudits && skipAudits.length > 0) {
      return diagnostics.filter(diag => !skipAudits.includes(diag.id));
    }

    return diagnostics;
  }
}

