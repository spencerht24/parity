/**
 * Performance Metrics
 *
 * Phase 3 Feature #3
 *
 * Captures Core Web Vitals and Navigation Timing metrics from a loaded
 * Playwright page. Uses window.performance.timing and PerformanceObserver
 * injected via page.addInitScript for real browser-measured values.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export type MetricRating = 'good' | 'needs-improvement' | 'poor';
export type MetricSeverity = 'critical' | 'high' | 'medium' | 'low' | null;

export interface MetricValue {
  /** Raw value in ms (or unitless for CLS) */
  value: number;
  unit: 'ms' | 'score';
  rating: MetricRating;
  severity: MetricSeverity;
  threshold: {
    good: number;
    poor: number;
  };
}

export interface PerformanceMetrics {
  /** Largest Contentful Paint (ms) */
  lcp?: MetricValue;
  /** First Input Delay (ms) */
  fid?: MetricValue;
  /** Cumulative Layout Shift (unitless score) */
  cls?: MetricValue;
  /** Interaction to Next Paint (ms) */
  inp?: MetricValue;
  /** Time to First Byte (ms) */
  ttfb: MetricValue;
  /** First Contentful Paint (ms) */
  fcp: MetricValue;
  /** DOMContentLoaded (ms from navigation start) */
  domContentLoaded: MetricValue;
  /** Load event (ms from navigation start) */
  loadEvent: MetricValue;
  /** DOM Interactive (ms from navigation start) */
  domInteractive: MetricValue;
  /** Total page load time (ms) */
  pageLoad: MetricValue;
}

export interface PerformanceResult {
  url: string;
  viewport: string;
  metrics: PerformanceMetrics;
  summary: {
    score: number; // 0-100
    passed: boolean;
    status: 'pass' | 'warn' | 'fail';
    failedMetrics: string[];
    warnedMetrics: string[];
  };
  timestamp: string;
  durationMs: number;
}

export interface PerformanceConfig {
  /** Thresholds in ms (or score for CLS). Null = use defaults */
  thresholds?: Partial<{
    lcpGood: number;
    lcpPoor: number;
    fidGood: number;
    fidPoor: number;
    clsGood: number;
    clsPoor: number;
    inpGood: number;
    inpPoor: number;
    ttfbGood: number;
    ttfbPoor: number;
    fcpGood: number;
    fcpPoor: number;
    loadGood: number;
    loadPoor: number;
  }>;
  /** Metrics that cause FAIL (vs WARN) when poor. Default: lcp, ttfb */
  failOnPoor?: string[];
  /** Metrics that cause WARN when needs-improvement. Default: all */
  warnOnNeedsImprovement?: string[];
}

// ============================================================================
// Default Thresholds (Google's Core Web Vitals standards)
// ============================================================================

const DEFAULTS = {
  // LCP
  lcpGood: 2500,
  lcpPoor: 4000,
  // FID
  fidGood: 100,
  fidPoor: 300,
  // CLS (unitless)
  clsGood: 0.1,
  clsPoor: 0.25,
  // INP
  inpGood: 200,
  inpPoor: 500,
  // TTFB
  ttfbGood: 600,
  ttfbPoor: 1800,
  // FCP
  fcpGood: 1800,
  fcpPoor: 3000,
  // Load event
  loadGood: 3000,
  loadPoor: 6000,
};

// ============================================================================
// Helpers
// ============================================================================

function rateMetric(value: number, good: number, poor: number): MetricRating {
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function ratingSeverity(
  rating: MetricRating,
  metricName: string,
  failOnPoor: string[],
  warnOnNeedsImprovement: string[]
): MetricSeverity {
  if (rating === 'good') return null;
  if (rating === 'poor') {
    if (failOnPoor.includes(metricName)) return 'high';
    return 'medium';
  }
  // needs-improvement
  if (warnOnNeedsImprovement.includes(metricName)) return 'low';
  return null;
}

function buildMetric(
  rawValue: number | undefined,
  goodThreshold: number,
  poorThreshold: number,
  unit: 'ms' | 'score',
  metricName: string,
  failOnPoor: string[],
  warnOnNeedsImprovement: string[]
): MetricValue | undefined {
  if (rawValue === undefined || rawValue === null || isNaN(rawValue)) return undefined;
  const rating = rateMetric(rawValue, goodThreshold, poorThreshold);
  const severity = ratingSeverity(rating, metricName, failOnPoor, warnOnNeedsImprovement);
  return {
    value: Math.round(unit === 'score' ? rawValue * 1000 : rawValue) / (unit === 'score' ? 1000 : 1),
    unit,
    rating,
    severity,
    threshold: { good: goodThreshold, poor: poorThreshold },
  };
}

// ============================================================================
// Web Vitals Init Script (injected before navigation)
// ============================================================================

const VITALS_INIT_SCRIPT = `
(function() {
  window.__parityVitals = {};

  // LCP observer
  try {
    new PerformanceObserver(function(list) {
      var entries = list.getEntries();
      if (entries.length > 0) {
        window.__parityVitals.lcp = entries[entries.length - 1].startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch(e) {}

  // CLS observer
  try {
    var clsValue = 0;
    var clsEntries = [];
    var sessionValue = 0;
    var sessionEntries = [];
    var lastEntryTime = 0;
    new PerformanceObserver(function(list) {
      list.getEntries().forEach(function(entry) {
        if (!entry.hadRecentInput) {
          var firstSessionEntry = sessionEntries[0];
          var lastSessionEntry = sessionEntries[sessionEntries.length - 1];
          if (
            sessionValue &&
            entry.startTime - lastSessionEntry.startTime < 1000 &&
            entry.startTime - firstSessionEntry.startTime < 5000
          ) {
            sessionValue += entry.value;
            sessionEntries.push(entry);
          } else {
            sessionValue = entry.value;
            sessionEntries = [entry];
          }
          if (sessionValue > clsValue) {
            clsValue = sessionValue;
            clsEntries = sessionEntries;
          }
          window.__parityVitals.cls = clsValue;
        }
      });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch(e) {}

  // FID / INP observer
  try {
    new PerformanceObserver(function(list) {
      list.getEntries().forEach(function(entry) {
        if (entry.processingStart && !window.__parityVitals.fid) {
          window.__parityVitals.fid = entry.processingStart - entry.startTime;
        }
      });
    }).observe({ type: 'first-input', buffered: true });
  } catch(e) {}

  // INP
  try {
    var maxDuration = 0;
    new PerformanceObserver(function(list) {
      list.getEntries().forEach(function(entry) {
        var duration = entry.duration || 0;
        if (duration > maxDuration) {
          maxDuration = duration;
          window.__parityVitals.inp = maxDuration;
        }
      });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch(e) {}
})();
`;

// ============================================================================
// Performance Capture
// ============================================================================

export class PerformanceCapture {
  private config: {
    thresholds: typeof DEFAULTS;
    failOnPoor: string[];
    warnOnNeedsImprovement: string[];
  };

  constructor(config: PerformanceConfig = {}) {
    const t = { ...DEFAULTS, ...(config.thresholds || {}) };
    this.config = {
      thresholds: t,
      failOnPoor: config.failOnPoor ?? ['lcp', 'ttfb'],
      warnOnNeedsImprovement: config.warnOnNeedsImprovement ?? [
        'lcp', 'fid', 'cls', 'inp', 'ttfb', 'fcp', 'domContentLoaded', 'loadEvent',
      ],
    };
  }

  /**
   * Inject the vitals init script BEFORE navigation.
   * Must be called before page.goto().
   */
  async attachInitScript(page: Page): Promise<void> {
    await page.addInitScript(VITALS_INIT_SCRIPT);
  }

  /**
   * Collect metrics AFTER page load (after networkidle / waitForTimeout).
   * Returns a PerformanceResult.
   */
  async collect(page: Page, viewportName: string = 'desktop'): Promise<PerformanceResult> {
    const url = page.url();
    const start = Date.now();

    // Give observers a moment to settle
    await page.waitForTimeout(500);

    // Collect web vitals from window (browser context — cast to any for Node-only tsconfig)
    const vitals = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return (globalThis as any).__parityVitals || {};
    });

    // Collect Navigation Timing
    const navTiming = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const perf = (globalThis as any).performance;
      const t = perf?.timing;
      if (!t) return null;
      return {
        navigationStart: t.navigationStart,
        fetchStart: t.fetchStart,
        domainLookupStart: t.domainLookupStart,
        domainLookupEnd: t.domainLookupEnd,
        connectStart: t.connectStart,
        connectEnd: t.connectEnd,
        responseStart: t.responseStart,
        responseEnd: t.responseEnd,
        domInteractive: t.domInteractive,
        domContentLoadedEventEnd: t.domContentLoadedEventEnd,
        loadEventEnd: t.loadEventEnd,
      };
    });

    const t = this.config.thresholds;
    const failOnPoor = this.config.failOnPoor;
    const warnOn = this.config.warnOnNeedsImprovement;

    // Compute derived values from navigation timing
    let ttfbValue: number | undefined;
    let fcpValue: number | undefined;
    let domContentLoadedValue: number | undefined;
    let loadEventValue: number | undefined;
    let domInteractiveValue: number | undefined;

    if (navTiming && navTiming.navigationStart > 0) {
      const ns = navTiming.navigationStart;
      if (navTiming.responseStart > 0) ttfbValue = navTiming.responseStart - ns;
      if (navTiming.domContentLoadedEventEnd > 0) domContentLoadedValue = navTiming.domContentLoadedEventEnd - ns;
      if (navTiming.loadEventEnd > 0) loadEventValue = navTiming.loadEventEnd - ns;
      if (navTiming.domInteractive > 0) domInteractiveValue = navTiming.domInteractive - ns;
    }

    // FCP from Paint API
    fcpValue = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const perf2 = (globalThis as any).performance;
      const paintEntries: any[] = perf2?.getEntriesByType?.('paint') || [];
      const fcp = paintEntries.find((e: any) => e.name === 'first-contentful-paint');
      return fcp ? fcp.startTime : undefined;
    });

    // Build metric objects
    const metrics: PerformanceMetrics = {
      lcp: buildMetric(vitals.lcp, t.lcpGood, t.lcpPoor, 'ms', 'lcp', failOnPoor, warnOn),
      fid: buildMetric(vitals.fid, t.fidGood, t.fidPoor, 'ms', 'fid', failOnPoor, warnOn),
      cls: buildMetric(vitals.cls, t.clsGood, t.clsPoor, 'score', 'cls', failOnPoor, warnOn),
      inp: buildMetric(vitals.inp, t.inpGood, t.inpPoor, 'ms', 'inp', failOnPoor, warnOn),
      ttfb: buildMetric(ttfbValue ?? 0, t.ttfbGood, t.ttfbPoor, 'ms', 'ttfb', failOnPoor, warnOn) ?? {
        value: 0,
        unit: 'ms',
        rating: 'good',
        severity: null,
        threshold: { good: t.ttfbGood, poor: t.ttfbPoor },
      },
      fcp: buildMetric(fcpValue ?? 0, t.fcpGood, t.fcpPoor, 'ms', 'fcp', failOnPoor, warnOn) ?? {
        value: 0,
        unit: 'ms',
        rating: 'good',
        severity: null,
        threshold: { good: t.fcpGood, poor: t.fcpPoor },
      },
      domContentLoaded: buildMetric(domContentLoadedValue ?? 0, 2000, 4000, 'ms', 'domContentLoaded', failOnPoor, warnOn) ?? {
        value: 0,
        unit: 'ms',
        rating: 'good',
        severity: null,
        threshold: { good: 2000, poor: 4000 },
      },
      loadEvent: buildMetric(loadEventValue ?? 0, t.loadGood, t.loadPoor, 'ms', 'loadEvent', failOnPoor, warnOn) ?? {
        value: 0,
        unit: 'ms',
        rating: 'good',
        severity: null,
        threshold: { good: t.loadGood, poor: t.loadPoor },
      },
      domInteractive: buildMetric(domInteractiveValue ?? 0, 2000, 4000, 'ms', 'domInteractive', failOnPoor, warnOn) ?? {
        value: 0,
        unit: 'ms',
        rating: 'good',
        severity: null,
        threshold: { good: 2000, poor: 4000 },
      },
      pageLoad: buildMetric(loadEventValue ?? 0, t.loadGood, t.loadPoor, 'ms', 'pageLoad', failOnPoor, warnOn) ?? {
        value: 0,
        unit: 'ms',
        rating: 'good',
        severity: null,
        threshold: { good: t.loadGood, poor: t.loadPoor },
      },
    };

    // Summarize
    const allMetrics = Object.entries(metrics).filter(([, v]) => v !== undefined) as [string, MetricValue][];
    const failedMetrics = allMetrics
      .filter(([, v]) => v.severity === 'critical' || v.severity === 'high')
      .map(([k]) => k);
    const warnedMetrics = allMetrics
      .filter(([, v]) => v.severity === 'medium' || v.severity === 'low')
      .map(([k]) => k);

    // Score: subtract penalties per metric rating
    let score = 100;
    for (const [, v] of allMetrics) {
      if (v.rating === 'poor') score -= 15;
      else if (v.rating === 'needs-improvement') score -= 5;
    }
    score = Math.max(0, score);

    const failed = failedMetrics.length > 0;
    const warned = !failed && warnedMetrics.length > 0;

    return {
      url,
      viewport: viewportName,
      metrics,
      summary: {
        score,
        passed: !failed,
        status: failed ? 'fail' : warned ? 'warn' : 'pass',
        failedMetrics,
        warnedMetrics,
      },
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPerformanceCapture(config?: PerformanceConfig): PerformanceCapture {
  return new PerformanceCapture(config);
}
