/**
 * Functional Test Runner
 *
 * Orchestrates all Phase 3 functional checks (broken links, console errors,
 * performance metrics) within a single Playwright browser session.
 */

import { chromium, Browser, Page } from 'playwright';
import { BrokenLinkChecker, BrokenLinksResult, BrokenLinksConfig } from './broken-links.js';
import { ConsoleMonitor, ConsoleMonitorResult, ConsoleMonitorConfig } from './console-monitor.js';
import { PerformanceCapture, PerformanceResult, PerformanceConfig } from './performance.js';

// ============================================================================
// Types
// ============================================================================

export interface FunctionalCheckConfig {
  brokenLinks?: BrokenLinksConfig | false;
  consoleErrors?: ConsoleMonitorConfig | false;
  performance?: PerformanceConfig | false;
  /** Playwright viewport */
  viewport?: { width: number; height: number; name?: string };
  /** Page load timeout ms */
  timeoutMs?: number;
  /** Wait after networkidle in ms */
  waitAfterLoadMs?: number;
  /** Custom user agent */
  userAgent?: string;
}

export interface FunctionalCheckResult {
  url: string;
  brokenLinks?: BrokenLinksResult;
  consoleErrors?: ConsoleMonitorResult;
  performance?: PerformanceResult;
  overallStatus: 'pass' | 'warn' | 'fail';
  overallPassed: boolean;
  timestamp: string;
  durationMs: number;
}

// ============================================================================
// Runner
// ============================================================================

export class FunctionalTestRunner {
  private browser: Browser | null = null;
  private config: FunctionalCheckConfig;

  constructor(config: FunctionalCheckConfig = {}) {
    this.config = {
      viewport: { width: 1440, height: 900, name: 'desktop' },
      timeoutMs: 30000,
      waitAfterLoadMs: 1000,
      ...config,
    };
  }

  async init(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({ headless: true });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Run all enabled functional checks against a URL.
   * Reuses a single browser session for efficiency.
   */
  async run(url: string): Promise<FunctionalCheckResult> {
    const start = Date.now();
    await this.init();

    const vp = this.config.viewport!;
    const context = await this.browser!.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: this.config.userAgent,
    });

    const page = await context.newPage();
    let brokenLinksResult: BrokenLinksResult | undefined;
    let consoleResult: ConsoleMonitorResult | undefined;
    let performanceResult: PerformanceResult | undefined;

    try {
      // 1. Attach console monitor BEFORE navigation
      let consoleMonitor: ConsoleMonitor | undefined;
      const consoleConfig = this.config.consoleErrors;
      if (consoleConfig !== false) {
        consoleMonitor = new ConsoleMonitor(
          consoleConfig !== undefined ? consoleConfig : undefined
        );
        consoleMonitor.attach(page, url);
      }

      // 2. Attach performance init script BEFORE navigation
      let perfCapture: PerformanceCapture | undefined;
      const perfConfig = this.config.performance;
      if (perfConfig !== false) {
        perfCapture = new PerformanceCapture(
          perfConfig !== undefined ? perfConfig : undefined
        );
        await perfCapture.attachInitScript(page);
      }

      // 3. Navigate to the page
      await page.goto(url, {
        timeout: this.config.timeoutMs,
        waitUntil: 'networkidle',
      });

      // 4. Optional extra wait
      if (this.config.waitAfterLoadMs && this.config.waitAfterLoadMs > 0) {
        await page.waitForTimeout(this.config.waitAfterLoadMs);
      }

      // 5. Collect console errors
      if (consoleMonitor) {
        consoleResult = consoleMonitor.collect(url);
      }

      // 6. Collect performance metrics
      if (perfCapture) {
        performanceResult = await perfCapture.collect(page, vp.name || 'desktop');
      }

      // 7. Broken links (runs after page is fully loaded)
      const linksConfig = this.config.brokenLinks;
      if (linksConfig !== false) {
        const checker = new BrokenLinkChecker(
          linksConfig !== undefined ? linksConfig : undefined
        );
        brokenLinksResult = await checker.check(page);
      }
    } finally {
      await context.close();
    }

    // Determine overall status
    const statuses = [
      brokenLinksResult?.status,
      consoleResult?.status,
      performanceResult?.summary.status,
    ].filter(Boolean) as Array<'pass' | 'warn' | 'fail'>;

    let overallStatus: 'pass' | 'warn' | 'fail' = 'pass';
    if (statuses.includes('fail')) overallStatus = 'fail';
    else if (statuses.includes('warn')) overallStatus = 'warn';

    return {
      url,
      brokenLinks: brokenLinksResult,
      consoleErrors: consoleResult,
      performance: performanceResult,
      overallStatus,
      overallPassed: overallStatus !== 'fail',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  /**
   * Run checks against multiple URLs sequentially
   */
  async runMultiple(urls: string[]): Promise<FunctionalCheckResult[]> {
    const results: FunctionalCheckResult[] = [];
    for (const url of urls) {
      results.push(await this.run(url));
    }
    return results;
  }
}

// ============================================================================
// Factory + convenience function
// ============================================================================

export function createFunctionalTestRunner(config?: FunctionalCheckConfig): FunctionalTestRunner {
  return new FunctionalTestRunner(config);
}

/**
 * Run all functional checks against a URL in one call.
 * Handles browser lifecycle automatically.
 */
export async function runFunctionalChecks(
  url: string,
  config?: FunctionalCheckConfig
): Promise<FunctionalCheckResult> {
  const runner = createFunctionalTestRunner(config);
  try {
    return await runner.run(url);
  } finally {
    await runner.close();
  }
}
