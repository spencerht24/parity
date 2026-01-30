/**
 * GitHub Action Module
 * 
 * Feature #6: GitHub Action package
 * 
 * Provides:
 * - ActionRunner for CI integration
 * - Config file parsing (.parity.yml)
 * - GitHub Actions output formatting
 */

export {
  ActionRunner,
  createActionRunner,
  loadConfig,
  type ActionConfig,
  type ActionResult,
  type ParityConfig,
  type PageMapping,
} from './github.js';
