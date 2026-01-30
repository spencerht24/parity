/**
 * Baseline Module
 * 
 * Feature #10: Baseline management
 * 
 * Provides:
 * - Store and track Figma design baselines
 * - Detect when designs change
 * - Version history
 * - Diff detection for PRs
 */

export {
  BaselineManager,
  createBaselineManager,
  type BaselineEntry,
  type BaselineManifest,
  type BaselineDiff,
} from './manager.js';
