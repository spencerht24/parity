/**
 * Report Module
 * 
 * Feature #4: Diff report generation
 * 
 * Provides:
 * - JSON report generation
 * - HTML report with side-by-side diffs
 * - Multi-page report aggregation
 * - Severity visualization
 */

export {
  ReportGenerator,
  createReportGenerator,
  type ReportOptions,
  type ReportResult,
  type MultiPageReport,
} from './generator.js';
