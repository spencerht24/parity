/**
 * Screenshot Module
 * 
 * Feature #2: Single-page screenshot capture
 * 
 * Provides:
 * - Playwright-based screenshot capture
 * - Multiple viewport support (desktop, tablet, mobile)
 * - Network idle detection
 * - Console error and network failure capture
 * - Custom wait conditions
 */

export {
  ScreenshotCapturer,
  createScreenshotCapturer,
  DEFAULT_VIEWPORTS,
  type Viewport,
  type CaptureOptions,
  type CapturedPage,
  type CaptureResult,
  type ConsoleMessage,
  type NetworkFailure,
} from './capture.js';
