/**
 * Checks Module
 * 
 * Feature #8: Status checks (pass/fail thresholds)
 * 
 * Provides:
 * - Configurable thresholds for CI pass/fail
 * - Multi-page checking
 * - GitHub Actions output formatting
 * - Preset threshold configs (strict, default, lenient)
 */

export {
  ThresholdChecker,
  createThresholdChecker,
  quickCheck,
  DEFAULT_THRESHOLDS,
  STRICT_THRESHOLDS,
  LENIENT_THRESHOLDS,
  type Thresholds,
  type CheckStatus,
  type CheckResult,
  type MultiPageCheckResult,
} from './thresholds.js';
