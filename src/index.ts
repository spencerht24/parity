/**
 * Parity - AI-powered UX Fidelity Testing Platform
 * 
 * Compare your live website against Figma designs using AI.
 * Catch visual drift from design intent, not just from yesterday's build.
 */

// Feature #1: Figma frame export
export * from './lib/figma/index.js';

// Feature #2: Screenshot capture
export * from './lib/screenshot/index.js';

// Feature #3: AI visual comparison
export * from './lib/comparison/index.js';

// Feature #4: Diff report generation
export * from './lib/report/index.js';

// Feature #5: Dashboard server
export * from './lib/dashboard/index.js';

// Feature #6: GitHub Action
export * from './lib/action/index.js';

// Feature #7: PR Comments
export * from './lib/github/index.js';

// Feature #8: Status Checks / Thresholds
export * from './lib/checks/index.js';

// Version
export const VERSION = '0.1.0';
