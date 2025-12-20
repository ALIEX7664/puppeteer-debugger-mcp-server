import { WebVitalsMetrics, WebVitalsRatings } from './lighthouse-types.js';
import { WebVitalsRating, WEB_VITALS_THRESHOLDS } from './lighthouse-constants.js';

export function getWebVitalsRating(
  metric: keyof typeof WEB_VITALS_THRESHOLDS,
  value: number
): WebVitalsRating {
  const thresholds = WEB_VITALS_THRESHOLDS[metric];

  if (value <= thresholds.GOOD) {
    return WebVitalsRating.GOOD;
  }
  if (value <= thresholds.NEEDS_IMPROVEMENT) {
    return WebVitalsRating.NEEDS_IMPROVEMENT;
  }
  return WebVitalsRating.POOR;
}

export function calculateWebVitalsRatings(
  metrics: WebVitalsMetrics
): Partial<Record<keyof WebVitalsMetrics, WebVitalsRating>> {
  const ratings: Partial<Record<keyof WebVitalsMetrics, WebVitalsRating>> = {};

  if (metrics.fcp !== null) {
    ratings.fcp = getWebVitalsRating('FCP', metrics.fcp);
  }
  if (metrics.lcp !== null) {
    ratings.lcp = getWebVitalsRating('LCP', metrics.lcp);
  }
  if (metrics.fid !== null) {
    ratings.fid = getWebVitalsRating('FID', metrics.fid);
  }
  if (metrics.cls !== null && metrics.cls > 0) {
    ratings.cls = getWebVitalsRating('CLS', metrics.cls);
  }
  if (metrics.ttfb !== null) {
    ratings.ttfb = getWebVitalsRating('TTFB', metrics.ttfb);
  }

  return ratings;
}

export function createPerformanceObserver(
  entryTypes: string[],
  callback: (entries: PerformanceEntry[]) => void,
  buffered = true
): PerformanceObserver | null {
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
}
