/**
 * Accessibility Module
 * 
 * Feature #11: A11y checks (axe-core)
 * 
 * Provides:
 * - WCAG accessibility audits
 * - Violation detection and reporting
 * - Impact-based severity levels
 * - Configurable rules and levels
 */

export {
  AccessibilityChecker,
  createAccessibilityChecker,
  type A11ySeverity,
  type A11yViolation,
  type A11yResult,
  type A11yConfig,
} from './checker.js';
