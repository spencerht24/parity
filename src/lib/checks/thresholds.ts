/**
 * Status Checks / Thresholds
 * 
 * Feature #8: Status checks (pass/fail thresholds)
 * 
 * Configure when CI checks should pass or fail based on
 * visual fidelity thresholds.
 */

import type { ComparisonResult, Severity } from '../comparison/index.js';

// ============================================================================
// Types
// ============================================================================

export interface Thresholds {
  /** Minimum overall match score (0-100) */
  minScore?: number;
  /** Maximum critical issues allowed */
  maxCritical?: number;
  /** Maximum high severity issues allowed */
  maxHigh?: number;
  /** Maximum medium severity issues allowed */
  maxMedium?: number;
  /** Maximum total issues allowed */
  maxTotal?: number;
}

export type CheckStatus = 'success' | 'warning' | 'failure';

export interface CheckResult {
  status: CheckStatus;
  passed: boolean;
  score: number;
  issues: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  failureReasons: string[];
  warningReasons: string[];
}

export interface MultiPageCheckResult {
  status: CheckStatus;
  passed: boolean;
  averageScore: number;
  pages: Array<{
    name: string;
    result: CheckResult;
  }>;
  summary: {
    totalPages: number;
    passedPages: number;
    failedPages: number;
    totalIssues: number;
  };
  failureReasons: string[];
}

// ============================================================================
// Default Thresholds
// ============================================================================

export const DEFAULT_THRESHOLDS: Required<Thresholds> = {
  minScore: 85,
  maxCritical: 0,
  maxHigh: 0,
  maxMedium: 5,
  maxTotal: 20,
};

export const STRICT_THRESHOLDS: Required<Thresholds> = {
  minScore: 95,
  maxCritical: 0,
  maxHigh: 0,
  maxMedium: 0,
  maxTotal: 5,
};

export const LENIENT_THRESHOLDS: Required<Thresholds> = {
  minScore: 70,
  maxCritical: 1,
  maxHigh: 5,
  maxMedium: 20,
  maxTotal: 50,
};

// ============================================================================
// Threshold Checker
// ============================================================================

export class ThresholdChecker {
  private thresholds: Required<Thresholds>;

  constructor(thresholds: Thresholds = {}) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    };
  }

  /**
   * Check a single comparison result against thresholds
   */
  check(result: ComparisonResult): CheckResult {
    const issues = this.countIssues(result.differences);
    const failureReasons: string[] = [];
    const warningReasons: string[] = [];

    // Check score
    if (result.matchScore < this.thresholds.minScore) {
      failureReasons.push(
        `Match score ${result.matchScore}% below threshold ${this.thresholds.minScore}%`
      );
    } else if (result.matchScore < this.thresholds.minScore + 5) {
      warningReasons.push(
        `Match score ${result.matchScore}% close to threshold ${this.thresholds.minScore}%`
      );
    }

    // Check critical issues
    if (issues.critical > this.thresholds.maxCritical) {
      failureReasons.push(
        `${issues.critical} critical issues (max: ${this.thresholds.maxCritical})`
      );
    }

    // Check high severity issues
    if (issues.high > this.thresholds.maxHigh) {
      failureReasons.push(
        `${issues.high} high severity issues (max: ${this.thresholds.maxHigh})`
      );
    }

    // Check medium severity issues
    if (issues.medium > this.thresholds.maxMedium) {
      failureReasons.push(
        `${issues.medium} medium severity issues (max: ${this.thresholds.maxMedium})`
      );
    } else if (issues.medium > this.thresholds.maxMedium * 0.8) {
      warningReasons.push(
        `${issues.medium} medium issues approaching limit (max: ${this.thresholds.maxMedium})`
      );
    }

    // Check total issues
    if (issues.total > this.thresholds.maxTotal) {
      failureReasons.push(
        `${issues.total} total issues (max: ${this.thresholds.maxTotal})`
      );
    }

    // Determine status
    let status: CheckStatus;
    if (failureReasons.length > 0) {
      status = 'failure';
    } else if (warningReasons.length > 0) {
      status = 'warning';
    } else {
      status = 'success';
    }

    return {
      status,
      passed: failureReasons.length === 0,
      score: result.matchScore,
      issues,
      failureReasons,
      warningReasons,
    };
  }

  /**
   * Check multiple pages
   */
  checkMultiple(
    results: Array<{ name: string; result: ComparisonResult }>
  ): MultiPageCheckResult {
    const pageResults = results.map(({ name, result }) => ({
      name,
      result: this.check(result),
    }));

    const passedPages = pageResults.filter(p => p.result.passed).length;
    const totalIssues = pageResults.reduce(
      (sum, p) => sum + p.result.issues.total,
      0
    );
    const averageScore = Math.round(
      pageResults.reduce((sum, p) => sum + p.result.score, 0) / pageResults.length
    );

    const allFailureReasons: string[] = [];
    for (const page of pageResults) {
      if (!page.result.passed) {
        allFailureReasons.push(`${page.name}: ${page.result.failureReasons.join(', ')}`);
      }
    }

    const status: CheckStatus = 
      allFailureReasons.length > 0 ? 'failure' :
      pageResults.some(p => p.result.status === 'warning') ? 'warning' :
      'success';

    return {
      status,
      passed: allFailureReasons.length === 0,
      averageScore,
      pages: pageResults,
      summary: {
        totalPages: results.length,
        passedPages,
        failedPages: results.length - passedPages,
        totalIssues,
      },
      failureReasons: allFailureReasons,
    };
  }

  /**
   * Count issues by severity
   */
  private countIssues(differences: ComparisonResult['differences']): CheckResult['issues'] {
    const counts = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    
    for (const diff of differences) {
      counts.total++;
      counts[diff.severity]++;
    }
    
    return counts;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): Required<Thresholds> {
    return { ...this.thresholds };
  }

  /**
   * Format result for GitHub Actions
   */
  static formatForGitHub(result: CheckResult): string {
    if (result.status === 'failure') {
      return `::error::Parity check failed: ${result.failureReasons.join('; ')}`;
    } else if (result.status === 'warning') {
      return `::warning::Parity check warnings: ${result.warningReasons.join('; ')}`;
    }
    return `::notice::Parity check passed with score ${result.score}%`;
  }

  /**
   * Format as exit code
   */
  static toExitCode(result: CheckResult): number {
    return result.passed ? 0 : 1;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createThresholdChecker(thresholds?: Thresholds): ThresholdChecker {
  return new ThresholdChecker(thresholds);
}

/**
 * Quick check function for simple use cases
 */
export function quickCheck(
  result: ComparisonResult,
  thresholds?: Thresholds
): CheckResult {
  return new ThresholdChecker(thresholds).check(result);
}
