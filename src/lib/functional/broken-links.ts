/**
 * Broken Link Detection
 *
 * Phase 3 Feature #1
 *
 * Extracts all links from a page and verifies each with an HTTP HEAD request.
 * Classifies results by severity and reports broken/redirected links.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export type LinkType = 'anchor' | 'image' | 'script' | 'iframe';
export type LinkSeverity = 'critical' | 'high' | 'medium' | 'low' | 'pass';

export interface ExtractedLink {
  url: string;
  type: LinkType;
  text?: string;
  foundOn: string;
}

export interface LinkCheckResult extends ExtractedLink {
  status: number;
  severity: LinkSeverity;
  redirectUrl?: string;
  redirectHops?: number;
  error?: string;
  durationMs: number;
}

export interface BrokenLinksResult {
  url: string;
  totalChecked: number;
  broken: number;
  warnings: number;
  passed: boolean;
  status: 'pass' | 'warn' | 'fail';
  results: LinkCheckResult[];
  timestamp: string;
  durationMs: number;
}

export interface BrokenLinksConfig {
  /** Check external links (cross-origin). Default: true */
  checkExternal?: boolean;
  /** Max concurrent requests. Default: 10 */
  concurrency?: number;
  /** Request timeout in ms. Default: 10000 */
  timeoutMs?: number;
  /** Max redirect hops before warning. Default: 3 */
  maxRedirectHops?: number;
  /** URL patterns to ignore */
  ignore?: string[];
  /** Treat 401/403 as warnings instead of errors */
  ignoreAuth?: boolean;
}

const DEFAULT_CONFIG: Required<BrokenLinksConfig> = {
  checkExternal: true,
  concurrency: 10,
  timeoutMs: 10000,
  maxRedirectHops: 3,
  ignore: [],
  ignoreAuth: true,
};

// ============================================================================
// Severity Classification
// ============================================================================

function classifySeverity(
  status: number,
  redirectHops: number,
  maxRedirectHops: number,
  error: string | undefined,
  ignoreAuth: boolean
): LinkSeverity {
  if (error) return 'high';
  if (status === 0) return 'high';
  if (status === 404 || status === 410) return 'critical';
  if (status >= 500) return 'high';
  if (status === 403 || status === 401) return ignoreAuth ? 'low' : 'medium';
  if (status >= 400) return 'medium';
  if (redirectHops > maxRedirectHops) return 'low';
  return 'pass';
}

// ============================================================================
// Link Extractor (runs in Playwright page context)
// ============================================================================

async function extractLinks(page: Page, pageUrl: string): Promise<ExtractedLink[]> {
  // Note: callback runs in browser context — DOM types cast to any to satisfy Node-only tsconfig
  const rawLinks = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = (globalThis as any).document;
    const results: Array<{ href: string; type: string; text?: string }> = [];

    // Anchors
    doc.querySelectorAll('a[href]').forEach((a: any) => {
      if (a.href) {
        results.push({ href: a.href, type: 'anchor', text: (a.textContent ?? '').trim().slice(0, 80) });
      }
    });

    // Images
    doc.querySelectorAll('img[src]').forEach((img: any) => {
      if (img.src) results.push({ href: img.src, type: 'image' });
    });

    // Scripts
    doc.querySelectorAll('script[src]').forEach((s: any) => {
      if (s.src) results.push({ href: s.src, type: 'script' });
    });

    // Iframes
    doc.querySelectorAll('iframe[src]').forEach((fr: any) => {
      if (fr.src) results.push({ href: fr.src, type: 'iframe' });
    });

    return results;
  });

  return rawLinks
    .filter(({ href }) => {
      try {
        const u = new URL(href);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    })
    .map(({ href, type, text }) => ({
      url: href,
      type: type as LinkType,
      text,
      foundOn: pageUrl,
    }));
}

// ============================================================================
// HTTP Checker
// ============================================================================

interface CheckResult {
  status: number;
  redirectHops: number;
  redirectUrl?: string;
  error?: string;
  durationMs: number;
}

async function checkLink(url: string, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now();
  let redirectHops = 0;
  let currentUrl = url;
  let lastRedirectUrl: string | undefined;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Parity/0.1 (UX fidelity testing; +https://github.com/spencerht24/parity)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect following to count hops
    let status = response.status;
    while ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && redirectHops < 10) {
      const location = response.headers.get('location');
      if (!location) break;
      redirectHops++;
      lastRedirectUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
      currentUrl = lastRedirectUrl;

      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), timeoutMs);
      try {
        response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal: controller2.signal,
          headers: {
            'User-Agent': 'Parity/0.1 (UX fidelity testing; +https://github.com/spencerht24/parity)',
          },
        });
        status = response.status;
      } finally {
        clearTimeout(timer2);
      }
    }

    return {
      status,
      redirectHops,
      redirectUrl: redirectHops > 0 ? lastRedirectUrl : undefined,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      status: 0,
      redirectHops: 0,
      error: error.includes('abort') ? 'timeout' : error,
      durationMs: Date.now() - start,
    };
  }
}

// ============================================================================
// Concurrency limiter (no external deps)
// ============================================================================

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ============================================================================
// Main Checker
// ============================================================================

export class BrokenLinkChecker {
  private config: Required<BrokenLinksConfig>;

  constructor(config: BrokenLinksConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check all links on a Playwright page
   */
  async check(page: Page): Promise<BrokenLinksResult> {
    const pageUrl = page.url();
    const start = Date.now();

    // Extract all links
    let links = await extractLinks(page, pageUrl);

    // Filter by config
    links = this.filterLinks(links, pageUrl);

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueLinks = links.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });

    console.log(`[BrokenLinks] Checking ${uniqueLinks.length} unique links...`);

    // Check all links with concurrency limit
    const checkResults = await runWithConcurrency(
      uniqueLinks,
      this.config.concurrency,
      async (link): Promise<LinkCheckResult> => {
        const result = await checkLink(link.url, this.config.timeoutMs);
        const severity = classifySeverity(
          result.status,
          result.redirectHops,
          this.config.maxRedirectHops,
          result.error,
          this.config.ignoreAuth
        );
        return {
          ...link,
          status: result.status,
          severity,
          redirectUrl: result.redirectUrl,
          redirectHops: result.redirectHops,
          error: result.error,
          durationMs: result.durationMs,
        };
      }
    );

    const broken = checkResults.filter(
      (r) => r.severity === 'critical' || r.severity === 'high'
    ).length;
    const warnings = checkResults.filter(
      (r) => r.severity === 'medium' || r.severity === 'low'
    ).length;

    const overallStatus: 'pass' | 'warn' | 'fail' =
      broken > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

    return {
      url: pageUrl,
      totalChecked: uniqueLinks.length,
      broken,
      warnings,
      passed: broken === 0,
      status: overallStatus,
      results: checkResults,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }

  private filterLinks(links: ExtractedLink[], pageUrl: string): ExtractedLink[] {
    const pageOrigin = new URL(pageUrl).origin;

    return links.filter((link) => {
      // Skip ignored patterns
      for (const pattern of this.config.ignore) {
        if (this.matchesPattern(link.url, pattern)) return false;
      }

      // Skip external if configured
      if (!this.config.checkExternal) {
        try {
          const linkOrigin = new URL(link.url).origin;
          if (linkOrigin !== pageOrigin) return false;
        } catch {
          return false;
        }
      }

      return true;
    });
  }

  private matchesPattern(url: string, pattern: string): boolean {
    // Simple glob-style pattern matching (* = wildcard)
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
    );
    return regex.test(url) || url.includes(pattern.replace(/\*/g, ''));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBrokenLinkChecker(config?: BrokenLinksConfig): BrokenLinkChecker {
  return new BrokenLinkChecker(config);
}
