/**
 * Config Module
 * 
 * Feature #9: Multi-page configuration
 * 
 * Provides:
 * - YAML and JSON config parsing
 * - Zod-validated schemas
 * - Default configuration merging
 * - Multi-page and multi-viewport support
 */

export {
  ConfigParser,
  createConfigParser,
  loadConfig,
  DEFAULT_CONFIG,
  ParityConfigSchema,
  type Viewport,
  type PageMapping,
  type ParityThresholds,
  type ParityChecks,
  type ParityConfig,
} from './parser.js';
