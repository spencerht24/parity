/**
 * Phase 3 Functional Testing - Tests
 *
 * Tests for broken link detection, console error monitoring,
 * and performance metrics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BrokenLinkChecker,
  createBrokenLinkChecker,
  type LinkCheckResult,
  type BrokenLinksResult,
} from '../src/lib/functional/broken-links.js';
import {
  ConsoleMonitor,
  createConsoleMonitor,
  type CapturedConsoleEvent,
  type ConsoleMonitorResult,
} from '../src/lib/functional/console-monitor.js';
import {
  PerformanceCapture,
  createPerformanceCapture,
  type PerformanceResult,
  type MetricValue,
} from '../src/lib/functional/performance.js';
import {
  FunctionalTestRunner,
  createFunctionalTestRunner,
  type FunctionalCheckResult,
} from '../src/lib/functional/runner.js';

// ============================================================================
// Mock Playwright Page
// ============================================================================

function createMockPage(overrides: Partial<any> = {}): any {
  const listeners: Record<string, Function[]> = {};
  return {
    url: () => 'https://example.com/',
    evaluate: vi.fn().mockResolvedValue({}),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event: string, handler: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    }),
    _emit: (event: string, ...args: any[]) => {
      (listeners[event] || []).forEach((h) => h(...args));
    },
    ...overrides,
  };
}

// ============================================================================
// Broken Link Checker Tests
// ============================================================================

describe('BrokenLinkChecker', () => {
  it('creates with default config', () => {
    const checker = createBrokenLinkChecker();
    expect(checker).toBeInstanceOf(BrokenLinkChecker);
  });

  it('creates with custom config', () => {
    const checker = createBrokenLinkChecker({
      concurrency: 5,
      timeoutMs: 5000,
      checkExternal: false,
    });
    expect(checker).toBeInstanceOf(BrokenLinkChecker);
  });

  it('returns a BrokenLinksResult with correct shape', async () => {
    const checker = createBrokenLinkChecker({ checkExternal: false });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'https://example.com/about', type: 'anchor', text: 'About' },
      ]),
    });

    // Mock the global fetch to avoid real network calls
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
    } as any);

    const result = await checker.check(page);

    expect(result).toHaveProperty('url', 'https://example.com/');
    expect(result).toHaveProperty('totalChecked');
    expect(result).toHaveProperty('broken');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('durationMs');
    expect(['pass', 'warn', 'fail']).toContain(result.status);

    global.fetch = origFetch;
  });

  it('classifies 404 as critical severity', async () => {
    const checker = createBrokenLinkChecker({ checkExternal: true, concurrency: 1 });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'https://example.com/missing', type: 'anchor', text: 'Missing' },
      ]),
    });

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 404,
      ok: false,
      headers: { get: () => null },
    } as any);

    const result = await checker.check(page);
    const brokenLink = result.results.find((r) => r.status === 404);
    expect(brokenLink?.severity).toBe('critical');
    expect(result.status).toBe('fail');
    expect(result.passed).toBe(false);

    global.fetch = origFetch;
  });

  it('classifies 200 as pass severity', async () => {
    const checker = createBrokenLinkChecker({ checkExternal: true, concurrency: 1 });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'https://example.com/ok', type: 'anchor', text: 'OK' },
      ]),
    });

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
    } as any);

    const result = await checker.check(page);
    const okLink = result.results.find((r) => r.status === 200);
    expect(okLink?.severity).toBe('pass');
    expect(result.status).toBe('pass');
    expect(result.passed).toBe(true);

    global.fetch = origFetch;
  });

  it('classifies 500 as high severity', async () => {
    const checker = createBrokenLinkChecker({ concurrency: 1 });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'https://example.com/error', type: 'anchor', text: 'Error' },
      ]),
    });

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 500,
      ok: false,
      headers: { get: () => null },
    } as any);

    const result = await checker.check(page);
    const errorLink = result.results.find((r) => r.status === 500);
    expect(errorLink?.severity).toBe('high');

    global.fetch = origFetch;
  });

  it('deduplicates URLs before checking', async () => {
    const checker = createBrokenLinkChecker({ concurrency: 5 });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'https://example.com/about', type: 'anchor', text: 'About 1' },
        { href: 'https://example.com/about', type: 'anchor', text: 'About 2' },
        { href: 'https://example.com/about', type: 'image' },
      ]),
    });

    const origFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
    } as any);
    global.fetch = mockFetch;

    const result = await checker.check(page);
    // Should only check once, not 3 times
    expect(result.totalChecked).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    global.fetch = origFetch;
  });

  it('handles network errors gracefully', async () => {
    const checker = createBrokenLinkChecker({ concurrency: 1 });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'https://dead-domain-xyz-123.example/', type: 'anchor', text: 'Dead' },
      ]),
    });

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));

    const result = await checker.check(page);
    expect(result.results[0].error).toBeTruthy();
    expect(result.results[0].severity).toBe('high');

    global.fetch = origFetch;
  });

  it('filters out non-http links (javascript:, mailto:)', async () => {
    const checker = createBrokenLinkChecker({ concurrency: 1 });
    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn().mockResolvedValue([
        { href: 'javascript:void(0)', type: 'anchor', text: 'JS' },
        { href: 'mailto:test@example.com', type: 'anchor', text: 'Email' },
        { href: 'https://example.com/ok', type: 'anchor', text: 'OK' },
      ]),
    });

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
    } as any);

    const result = await checker.check(page);
    // Only the https link should be checked
    expect(result.totalChecked).toBe(1);

    global.fetch = origFetch;
  });
});

// ============================================================================
// Console Monitor Tests
// ============================================================================

describe('ConsoleMonitor', () => {
  it('creates with default config', () => {
    const monitor = createConsoleMonitor();
    expect(monitor).toBeInstanceOf(ConsoleMonitor);
  });

  it('creates with custom config', () => {
    const monitor = createConsoleMonitor({
      captureLevels: ['error'],
      failOnError: false,
    });
    expect(monitor).toBeInstanceOf(ConsoleMonitor);
  });

  it('captures console.error events', () => {
    const monitor = createConsoleMonitor();
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');

    // Simulate a console error event
    page._emit('console', {
      type: () => 'error',
      text: () => 'Something went wrong',
      location: () => ({ url: 'https://example.com/js/app.js', lineNumber: 42 }),
    });

    const result = monitor.collect();
    expect(result.errorCount).toBe(1);
    expect(result.events[0].type).toBe('error');
    expect(result.events[0].message).toBe('Something went wrong');
    expect(result.events[0].severity).toBe('high');
  });

  it('captures uncaught exceptions', () => {
    const monitor = createConsoleMonitor();
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');

    const err = new Error("Cannot read properties of undefined (reading 'map')");
    page._emit('pageerror', err);

    const result = monitor.collect();
    expect(result.exceptionCount).toBe(1);
    expect(result.events[0].type).toBe('exception');
    expect(result.events[0].severity).toBe('critical');
    expect(result.status).toBe('fail');
    expect(result.passed).toBe(false);
  });

  it('captures console.warn events', () => {
    const monitor = createConsoleMonitor();
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');

    page._emit('console', {
      type: () => 'warning',
      text: () => 'Deprecated API usage',
      location: () => ({ url: 'https://example.com/js/app.js', lineNumber: 10 }),
    });

    const result = monitor.collect();
    expect(result.warnCount).toBe(1);
    expect(result.events[0].type).toBe('warn');
    expect(result.events[0].severity).toBe('medium');
  });

  it('ignores patterns matching config.ignorePatterns', () => {
    const monitor = createConsoleMonitor({
      ignorePatterns: ['ResizeObserver loop', 'Non-passive event listener'],
    });
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');

    page._emit('console', {
      type: () => 'error',
      text: () => 'ResizeObserver loop limit exceeded',
      location: () => ({}),
    });

    const result = monitor.collect();
    expect(result.errorCount).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.status).toBe('pass');
  });

  it('marks hydration errors as critical', () => {
    const monitor = createConsoleMonitor({
      criticalPatterns: ['Hydration', 'hydration'],
    });
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');

    page._emit('console', {
      type: () => 'error',
      text: () => 'Hydration failed: server-rendered HTML does not match',
      location: () => ({ url: 'https://example.com/js/app.js', lineNumber: 1 }),
    });

    const result = monitor.collect();
    expect(result.events[0].severity).toBe('critical');
  });

  it('has correct bySeverity counts', () => {
    const monitor = createConsoleMonitor();
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');

    // One error (high)
    page._emit('console', {
      type: () => 'error',
      text: () => 'Error 1',
      location: () => ({}),
    });

    // One exception (critical)
    page._emit('pageerror', new Error('Exception 1'));

    // One warn (medium)
    page._emit('console', {
      type: () => 'warning',
      text: () => 'Warn 1',
      location: () => ({}),
    });

    const result = monitor.collect();
    expect(result.bySeverity.critical).toBe(1);
    expect(result.bySeverity.high).toBe(1);
    expect(result.bySeverity.medium).toBe(1);
    expect(result.status).toBe('fail');
  });

  it('returns pass status when no errors captured', () => {
    const monitor = createConsoleMonitor();
    const page = createMockPage();

    monitor.attach(page, 'https://example.com/');
    // No events emitted

    const result = monitor.collect();
    expect(result.passed).toBe(true);
    expect(result.status).toBe('pass');
    expect(result.errorCount).toBe(0);
    expect(result.exceptionCount).toBe(0);
  });

  it('resets state between pages', () => {
    const monitor = createConsoleMonitor();
    const page1 = createMockPage();

    monitor.attach(page1, 'https://example.com/page1');
    page1._emit('console', {
      type: () => 'error',
      text: () => 'Error on page 1',
      location: () => ({}),
    });

    const result1 = monitor.collect();
    expect(result1.errorCount).toBe(1);

    // Reset and use on page 2
    monitor.reset();
    const page2 = createMockPage();
    monitor.attach(page2, 'https://example.com/page2');

    const result2 = monitor.collect();
    expect(result2.errorCount).toBe(0);
  });
});

// ============================================================================
// Performance Capture Tests
// ============================================================================

describe('PerformanceCapture', () => {
  it('creates with default config', () => {
    const perf = createPerformanceCapture();
    expect(perf).toBeInstanceOf(PerformanceCapture);
  });

  it('attaches init script to page', async () => {
    const perf = createPerformanceCapture();
    const page = createMockPage();

    await perf.attachInitScript(page);

    expect(page.addInitScript).toHaveBeenCalledOnce();
    const scriptArg = page.addInitScript.mock.calls[0][0];
    expect(typeof scriptArg).toBe('string');
    expect(scriptArg).toContain('__parityVitals');
  });

  it('collects navigation timing metrics', async () => {
    const perf = createPerformanceCapture();
    const now = Date.now();

    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn()
        .mockResolvedValueOnce({ lcp: 1500, cls: 0.05 }) // vitals
        .mockResolvedValueOnce({                          // navigation timing
          navigationStart: now - 2000,
          responseStart: now - 1700,
          domInteractive: now - 1200,
          domContentLoadedEventEnd: now - 1000,
          loadEventEnd: now - 500,
          fetchStart: now - 2000,
        })
        .mockResolvedValueOnce(800), // FCP
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const result = await perf.collect(page, 'desktop');

    expect(result).toHaveProperty('url', 'https://example.com/');
    expect(result).toHaveProperty('viewport', 'desktop');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('score');
    expect(result.summary).toHaveProperty('status');
    expect(['pass', 'warn', 'fail']).toContain(result.summary.status);
  });

  it('rates LCP > 4000ms as poor', async () => {
    const perf = createPerformanceCapture({
      failOnPoor: ['lcp'],
    });
    const now = Date.now();

    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn()
        .mockResolvedValueOnce({ lcp: 5000 })  // poor LCP
        .mockResolvedValueOnce({
          navigationStart: now - 6000,
          responseStart: now - 5800,
          domInteractive: now - 4000,
          domContentLoadedEventEnd: now - 3500,
          loadEventEnd: now - 2000,
        })
        .mockResolvedValueOnce(800),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const result = await perf.collect(page, 'desktop');
    expect(result.metrics.lcp?.rating).toBe('poor');
    expect(result.summary.failedMetrics).toContain('lcp');
    expect(result.summary.status).toBe('fail');
  });

  it('rates LCP < 2500ms as good', async () => {
    const perf = createPerformanceCapture();
    const now = Date.now();

    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn()
        .mockResolvedValueOnce({ lcp: 1200, cls: 0.02 })
        .mockResolvedValueOnce({
          navigationStart: now - 2000,
          responseStart: now - 1800,
          domInteractive: now - 1500,
          domContentLoadedEventEnd: now - 1300,
          loadEventEnd: now - 1000,
        })
        .mockResolvedValueOnce(600),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const result = await perf.collect(page, 'desktop');
    expect(result.metrics.lcp?.rating).toBe('good');
    expect(result.metrics.lcp?.severity).toBeNull();
  });

  it('rates TTFB > 600ms as needs-improvement', async () => {
    const perf = createPerformanceCapture();
    const now = Date.now();

    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          navigationStart: now - 2000,
          responseStart: now - 1200, // TTFB = 800ms (needs-improvement)
          domInteractive: now - 1000,
          domContentLoadedEventEnd: now - 800,
          loadEventEnd: now - 500,
        })
        .mockResolvedValueOnce(600),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const result = await perf.collect(page, 'desktop');
    expect(result.metrics.ttfb.value).toBe(800);
    expect(result.metrics.ttfb.rating).toBe('needs-improvement');
  });

  it('returns a summary score between 0 and 100', async () => {
    const perf = createPerformanceCapture();
    const now = Date.now();

    const page = createMockPage({
      url: () => 'https://example.com/',
      evaluate: vi.fn()
        .mockResolvedValueOnce({ lcp: 2000, cls: 0.05 })
        .mockResolvedValueOnce({
          navigationStart: now - 3000,
          responseStart: now - 2800,
          domInteractive: now - 2000,
          domContentLoadedEventEnd: now - 1800,
          loadEventEnd: now - 1200,
        })
        .mockResolvedValueOnce(900),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    });

    const result = await perf.collect(page, 'desktop');
    expect(result.summary.score).toBeGreaterThanOrEqual(0);
    expect(result.summary.score).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Functional Test Runner Tests
// ============================================================================

describe('FunctionalTestRunner', () => {
  it('creates with default config', () => {
    const runner = createFunctionalTestRunner();
    expect(runner).toBeInstanceOf(FunctionalTestRunner);
  });

  it('creates with custom config', () => {
    const runner = createFunctionalTestRunner({
      brokenLinks: { checkExternal: false },
      consoleErrors: { failOnError: false },
      performance: false,
    });
    expect(runner).toBeInstanceOf(FunctionalTestRunner);
  });

  it('FunctionalCheckResult has correct shape', () => {
    // Test the shape of the result type
    const result: FunctionalCheckResult = {
      url: 'https://example.com/',
      overallStatus: 'pass',
      overallPassed: true,
      timestamp: new Date().toISOString(),
      durationMs: 100,
    };

    expect(result.url).toBe('https://example.com/');
    expect(result.overallStatus).toBe('pass');
    expect(result.overallPassed).toBe(true);
    expect(['pass', 'warn', 'fail']).toContain(result.overallStatus);
  });
});
