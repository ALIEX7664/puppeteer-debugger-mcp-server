import type { WebVitalsRating } from './lighthouse-constants.js';

export interface GetLighthouseParams {
  url?: string;
  onlyCategories?: string[];
  skipAudits?: string[];
}

export interface LighthouseCategory {
  score: number;
  title: string;
}

export interface WebVitalsMetrics {
  fcp: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number;
  ttfb: number | null;
}

export interface WebVitalsRatings {
  fcp?: WebVitalsRating;
  lcp?: WebVitalsRating;
  fid?: WebVitalsRating;
  cls?: WebVitalsRating;
  ttfb?: WebVitalsRating;
}

export interface PerformanceMetrics {
  tbt: number;
  tti: number;
  speedIndex: number;
}

export interface LighthouseMetrics {
  firstContentfulPaint: number | null;
  largestContentfulPaint: number | null;
  totalBlockingTime: number;
  cumulativeLayoutShift: number;
  speedIndex: number;
  timeToInteractive: number;
  firstInputDelay: number | null;
  timeToFirstByte: number | null;
  ratings?: WebVitalsRatings;
}

export interface LighthouseAudit {
  id: string;
  title: string;
  description?: string;
  score?: number;
  numericValue?: number;
  displayValue?: string;
}

export interface LighthouseReport {
  url: string;
  fetchTime: string;
  userAgent: string;
  categories: {
    performance?: LighthouseCategory;
    accessibility?: LighthouseCategory;
    'best-practices'?: LighthouseCategory;
    seo?: LighthouseCategory;
  };
  metrics: LighthouseMetrics;
  opportunities: LighthouseAudit[];
  diagnostics: LighthouseAudit[];
  implementation: 'approximation';
  limitations?: string[];
}
