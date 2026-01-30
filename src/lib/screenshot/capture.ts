/**
 * Screenshot Capture Module
 * 
 * Feature #2: Single-page screenshot capture
 * 
 * Uses Playwright to capture live website screenshots for comparison.
 * Supports multiple viewports, network idle detection, and custom wait conditions.
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

export interface CaptureOptions {
  /** Viewports to capture */
  viewports?: Viewport[];
  /** Wait for network to be idle */
  waitForNetworkIdle?: boolean;
  /** Additional wait time in ms after page load */
  waitAfterLoad?: number;
  /** Custom wait selector (wait for element to appear) */
  waitForSelector?: string;
  /** Full page screenshot or viewport only */
  fullPage?: boolean;
  /** Screenshot format */
  format?: 'png' | 'jpeg';
  /** JPEG quality (0-100) */
  quality?: number;
  /** Custom user agent */
  userAgent?: string;
  /** Timeout in ms */
  timeout?: number;
  /** Capture console errors */
  captureConsoleErrors?: boolean;
  /** Capture network failures */
  captureNetworkFailures?: boolean;
}

export interface CapturedPage {
  url: string;
  title: string;
  viewport: Viewport;
  screenshotPath: string;
  capturedAt: string;
  loadTime: number;
  consoleErrors: ConsoleMessage[];
  networkFailures: NetworkFailure[];
}

export interface ConsoleMessage {
  type: 'error' | 'warning' | 'log';
  text: string;
  location?: string;
}

export interface NetworkFailure {
  url: string;
  status?: number;
  error?: string;
}

export interface CaptureResult {
  url: string;
  captures: CapturedPage[];
  errors: string[];
}

// ============================================================================
// Screenshot Capturer
// ============================================================================

export class ScreenshotCapturer {
  private browser: Browser | null = null;
  private outputDir: string;
  private options: Required<CaptureOptions>;

  constructor(
    outputDir: string = './.parity-cache/screenshots',
    options: CaptureOptions = {}
  ) {
    this.outputDir = outputDir;
    this.options = {
      viewports: options.viewports || DEFAULT_VIEWPORTS,
      waitForNetworkIdle: options.waitForNetworkIdle ?? true,
      waitAfterLoad: options.waitAfterLoad ?? 500,
      waitForSelector: options.waitForSelector || '',
      fullPage: options.fullPage ?? true,
      format: options.format || 'png',
      quality: options.quality || 80,
      userAgent: options.userAgent || '',
      timeout: options.timeout || 30000,
      captureConsoleErrors: options.captureConsoleErrors ?? true,
      captureNetworkFailures: options.captureNetworkFailures ?? true,
    };
  }

  /**
   * Initialize the browser
   */
  async init(): Promise<void> {
    if (this.browser) return;

    console.log('[Screenshot] Launching browser...');
    this.browser = await chromium.launch({
      headless: true,
    });

    await this.ensureOutputDir();
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Capture screenshots of a URL at all configured viewports
   */
  async capture(url: string, options?: Partial<CaptureOptions>): Promise<CaptureResult> {
    const opts = { ...this.options, ...options };
    const result: CaptureResult = {
      url,
      captures: [],
      errors: [],
    };

    await this.init();

    for (const viewport of opts.viewports!) {
      try {
        const capture = await this.captureViewport(url, viewport, opts);
        result.captures.push(capture);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`${viewport.name}: ${errorMsg}`);
        console.error(`[Screenshot] Error capturing ${viewport.name}:`, errorMsg);
      }
    }

    return result;
  }

  /**
   * Capture a single viewport
   */
  private async captureViewport(
    url: string,
    viewport: Viewport,
    options: Required<CaptureOptions>
  ): Promise<CapturedPage> {
    console.log(`[Screenshot] Capturing ${viewport.name} (${viewport.width}x${viewport.height})...`);

    const context = await this.browser!.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      userAgent: options.userAgent || undefined,
    });

    const page = await context.newPage();
    
    const consoleErrors: ConsoleMessage[] = [];
    const networkFailures: NetworkFailure[] = [];

    // Set up console listener
    if (options.captureConsoleErrors) {
      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          consoleErrors.push({
            type: type as 'error' | 'warning',
            text: msg.text(),
            location: msg.location()?.url,
          });
        }
      });

      page.on('pageerror', (error) => {
        consoleErrors.push({
          type: 'error',
          text: error.message,
        });
      });
    }

    // Set up network listener
    if (options.captureNetworkFailures) {
      page.on('response', (response) => {
        const status = response.status();
        if (status >= 400) {
          networkFailures.push({
            url: response.url(),
            status,
          });
        }
      });

      page.on('requestfailed', (request) => {
        networkFailures.push({
          url: request.url(),
          error: request.failure()?.errorText,
        });
      });
    }

    const startTime = Date.now();

    try {
      // Navigate to the page
      await page.goto(url, {
        timeout: options.timeout,
        waitUntil: options.waitForNetworkIdle ? 'networkidle' : 'load',
      });

      // Wait for custom selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeout,
        });
      }

      // Additional wait time
      if (options.waitAfterLoad > 0) {
        await page.waitForTimeout(options.waitAfterLoad);
      }

      const loadTime = Date.now() - startTime;
      const title = await page.title();

      // Generate unique filename
      const filename = this.generateFilename(url, viewport, options.format);
      const screenshotPath = join(this.outputDir, filename);

      // Capture screenshot
      await page.screenshot({
        path: screenshotPath,
        fullPage: options.fullPage,
        type: options.format,
        quality: options.format === 'jpeg' ? options.quality : undefined,
      });

      console.log(`[Screenshot] ✓ ${viewport.name} captured in ${loadTime}ms`);

      return {
        url,
        title,
        viewport,
        screenshotPath,
        capturedAt: new Date().toISOString(),
        loadTime,
        consoleErrors,
        networkFailures,
      };
    } finally {
      await context.close();
    }
  }

  /**
   * Capture multiple URLs
   */
  async captureMultiple(
    urls: string[],
    options?: Partial<CaptureOptions>
  ): Promise<CaptureResult[]> {
    const results: CaptureResult[] = [];
    
    for (const url of urls) {
      const result = await this.capture(url, options);
      results.push(result);
    }
    
    return results;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async ensureOutputDir(): Promise<void> {
    try {
      await access(this.outputDir);
    } catch {
      await mkdir(this.outputDir, { recursive: true });
    }
  }

  private generateFilename(url: string, viewport: Viewport, format: string): string {
    const urlHash = createHash('md5').update(url).digest('hex').slice(0, 8);
    const timestamp = Date.now();
    return `${urlHash}_${viewport.name}_${timestamp}.${format}`;
  }

  /**
   * Get current options
   */
  getOptions(): Required<CaptureOptions> {
    return { ...this.options };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createScreenshotCapturer(
  outputDir?: string,
  options?: CaptureOptions
): ScreenshotCapturer {
  return new ScreenshotCapturer(outputDir, options);
}
