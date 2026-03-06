/**
 * Console Error Monitor
 *
 * Phase 3 Feature #2
 *
 * Captures browser console messages and uncaught JS exceptions
 * during Playwright page load. Classifies by severity and filters noise.
 */

import type { Page, ConsoleMessage as PlaywrightConsoleMessage } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export type ConsoleEventType = 'error' | 'warn' | 'exception' | 'log' | 'info' | 'debug';
export type ConsoleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface CapturedConsoleEvent {
  type: ConsoleEventType;
  severity: ConsoleSeverity;
  message: string;
  source?: string;
  timestamp: number;
  isThirdParty: boolean;
}

export interface ConsoleMonitorResult {
  url: string;
  events: CapturedConsoleEvent[];
  errorCount: number;
  warnCount: number;
  exceptionCount: number;
  bySeverity: Record<ConsoleSeverity, number>;
  passed: boolean;
  status: 'pass' | 'warn' | 'fail';
  timestamp: string;
}

export interface ConsoleMonitorConfig {
  /** Capture these log levels. Default: ['error', 'warn', 'exception'] */
  captureLevels?: ConsoleEventType[];
  /** URL patterns to ignore (third-party noise, etc.) */
  ignorePatterns?: string[];
  /** Automatically ignore errors from cross-origin scripts */
  ignoreThirdParty?: boolean;
  /** Patterns that override severity to 'critical' */
  criticalPatterns?: string[];
  /** Fail if any console.error is captured */
  failOnError?: boolean;
  /** Fail if any uncaught exception is captured */
  failOnException?: boolean;
}

const DEFAULT_CONFIG: Required<ConsoleMonitorConfig> = {
  captureLevels: ['error', 'warn', 'exception'],
  ignorePatterns: [
    'ResizeObserver loop',
    'Non-passive event listener',
    '[HMR]',
    '[vite]',
    'Download the React DevTools',
    'React DevTools',
  ],
  ignoreThirdParty: false,
  criticalPatterns: ['hydration', 'Hydration', 'HYDRATION'],
  failOnError: true,
  failOnException: true,
};

// ============================================================================
// Severity Mapping
// ============================================================================

function mapSeverity(
  type: ConsoleEventType,
  message: string,
  criticalPatterns: string[]
): ConsoleSeverity {
  // Check for critical override patterns
  for (const pattern of criticalPatterns) {
    if (message.includes(pattern)) return 'critical';
  }

  switch (type) {
    case 'exception':
      return 'critical';
    case 'error':
      return 'high';
    case 'warn':
      return 'medium';
    case 'log':
    case 'info':
      return 'low';
    case 'debug':
      return 'info';
    default:
      return 'info';
  }
}

function isThirdParty(source: string | undefined, pageUrl: string): boolean {
  if (!source) return false;
  try {
    const sourceOrigin = new URL(source).origin;
    const pageOrigin = new URL(pageUrl).origin;
    return sourceOrigin !== pageOrigin;
  } catch {
    return false;
  }
}

function matchesAny(message: string, patterns: string[]): boolean {
  return patterns.some((p) => message.includes(p));
}

// ============================================================================
// Console Monitor
// ============================================================================

export class ConsoleMonitor {
  private config: Required<ConsoleMonitorConfig>;
  private events: CapturedConsoleEvent[] = [];
  private pageUrl: string = '';

  constructor(config: ConsoleMonitorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach listeners to a Playwright page BEFORE navigation.
   * Call this before page.goto().
   */
  attach(page: Page, pageUrl: string): void {
    this.events = [];
    this.pageUrl = pageUrl;

    // Capture console.* messages
    page.on('console', (msg: PlaywrightConsoleMessage) => {
      const rawType = msg.type() as string;

      // Map Playwright type to our type
      let type: ConsoleEventType;
      switch (rawType) {
        case 'error':
          type = 'error';
          break;
        case 'warning':
          type = 'warn';
          break;
        case 'log':
          type = 'log';
          break;
        case 'info':
          type = 'info';
          break;
        case 'debug':
          type = 'debug';
          break;
        default:
          type = rawType as ConsoleEventType;
      }

      // Only capture configured levels
      if (!this.config.captureLevels.includes(type)) return;

      const message = msg.text();
      const location = msg.location();
      const source = location?.url;

      // Skip ignored patterns
      if (matchesAny(message, this.config.ignorePatterns)) return;

      const thirdParty = isThirdParty(source, this.pageUrl);
      if (this.config.ignoreThirdParty && thirdParty) return;

      const severity = mapSeverity(type, message, this.config.criticalPatterns);

      this.events.push({
        type,
        severity,
        message,
        source: source ? `${source}${location?.lineNumber ? `:${location.lineNumber}` : ''}` : undefined,
        timestamp: Date.now(),
        isThirdParty: thirdParty,
      });
    });

    // Capture uncaught JS exceptions
    page.on('pageerror', (error: Error) => {
      if (!this.config.captureLevels.includes('exception')) return;

      const message = error.message || String(error);
      if (matchesAny(message, this.config.ignorePatterns)) return;

      this.events.push({
        type: 'exception',
        severity: 'critical',
        message: error.stack ? `${message}\n${error.stack}` : message,
        source: undefined,
        timestamp: Date.now(),
        isThirdParty: false,
      });
    });
  }

  /**
   * Collect results after page load is complete.
   */
  collect(url?: string): ConsoleMonitorResult {
    const pageUrl = url || this.pageUrl;

    const errorCount = this.events.filter((e) => e.type === 'error').length;
    const warnCount = this.events.filter((e) => e.type === 'warn').length;
    const exceptionCount = this.events.filter((e) => e.type === 'exception').length;

    const bySeverity: Record<ConsoleSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const e of this.events) {
      bySeverity[e.severity]++;
    }

    const hasCritical = bySeverity.critical > 0;
    const hasErrors = this.config.failOnError && errorCount > 0;
    const hasExceptions = this.config.failOnException && exceptionCount > 0;

    const failed = hasCritical || hasErrors || hasExceptions;
    const warned = !failed && (warnCount > 0 || bySeverity.high > 0);

    return {
      url: pageUrl,
      events: [...this.events],
      errorCount,
      warnCount,
      exceptionCount,
      bySeverity,
      passed: !failed,
      status: failed ? 'fail' : warned ? 'warn' : 'pass',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset captured events (for reuse across multiple pages)
   */
  reset(): void {
    this.events = [];
    this.pageUrl = '';
  }

  /**
   * Get raw events (useful for debugging)
   */
  getEvents(): CapturedConsoleEvent[] {
    return [...this.events];
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConsoleMonitor(config?: ConsoleMonitorConfig): ConsoleMonitor {
  return new ConsoleMonitor(config);
}
