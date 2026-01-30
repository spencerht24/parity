/**
 * Comparison Module
 * 
 * Feature #3: AI visual comparison engine
 * 
 * Provides:
 * - AI-powered semantic visual comparison
 * - Multi-provider support (OpenAI, Anthropic)
 * - Difference categorization and severity scoring
 * - Threshold-based pass/fail
 */

export {
  ComparisonEngine,
  createComparisonEngine,
  type Severity,
  type VisualDifference,
  type ComparisonResult,
  type ComparisonOptions,
  type DifferenceLocation,
} from './engine.js';
