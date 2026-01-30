/**
 * Figma Module
 * 
 * Feature #1: Figma frame export via API
 * 
 * Provides:
 * - FigmaClient: Core API client with rate limiting
 * - Frame discovery and export
 * - Image caching (content-hash based)
 * - Design token extraction
 */

export {
  FigmaClient,
  createFigmaClient,
  type FigmaClientConfig,
  type ExportedFrame,
  type DesignTokens,
} from './client.js';
