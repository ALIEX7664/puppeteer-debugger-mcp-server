export enum WebVitalsRating {
  GOOD = 'good',
  NEEDS_IMPROVEMENT = 'needs-improvement',
  POOR = 'poor',
}

export const WEB_VITALS_THRESHOLDS = {
  FCP: {
    GOOD: 1800,
    NEEDS_IMPROVEMENT: 3000,
  },
  LCP: {
    GOOD: 2500,
    NEEDS_IMPROVEMENT: 4000,
  },
  FID: {
    GOOD: 100,
    NEEDS_IMPROVEMENT: 300,
  },
  CLS: {
    GOOD: 0.1,
    NEEDS_IMPROVEMENT: 0.25,
  },
  TTFB: {
    GOOD: 800,
    NEEDS_IMPROVEMENT: 1800,
  },
} as const;

export const PERFORMANCE_THRESHOLDS = {
  TBT: {
    GOOD: 200,
    NEEDS_IMPROVEMENT: 600,
  },
  TTI: {
    WARNING: 3800,
    CRITICAL: 7300,
  },
  LONG_TASK_DURATION: 50,
} as const;

export const SCORING_THRESHOLDS = {
  FCP: {
    EXCELLENT: 1800,
    GOOD: 3000,
    FAIR: 3800,
  },
  LCP: {
    EXCELLENT: 2500,
    GOOD: 4000,
  },
  CLS: {
    EXCELLENT: 0.1,
    GOOD: 0.25,
  },
  TBT: {
    EXCELLENT: 200,
    GOOD: 600,
  },
} as const;

export const WAIT_TIMES = {
  METRICS_STABLE: 500,
  METRICS_COLLECTION_SHORT: 1000,
  METRICS_COLLECTION_LONG: 3000,
  PAGE_LOAD_TIMEOUT: 30000,
  FALLBACK_DELAY: 2000,
} as const;

export const LIMITATIONS = [
  'accessibility/best-practices/seo 评分为近似值，非完整审计',
  '指标采集基于 Web Vitals 和 CDP，可能与真实 Lighthouse 结果有差异',
  '部分审计项可能缺失或不完整',
] as const;
