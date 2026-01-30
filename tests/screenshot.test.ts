/**
 * Screenshot Capture Tests
 * 
 * Note: These tests require Playwright browser dependencies.
 * Run: npx playwright install-deps chromium
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  ScreenshotCapturer, 
  createScreenshotCapturer,
  DEFAULT_VIEWPORTS,
} from '../src/lib/screenshot/index.js';
import { rm } from 'fs/promises';

const TEST_OUTPUT_DIR = './test-screenshots';

describe('ScreenshotCapturer', () => {
  describe('DEFAULT_VIEWPORTS', () => {
    it('should have desktop, tablet, and mobile viewports', () => {
      expect(DEFAULT_VIEWPORTS).toHaveLength(3);
      expect(DEFAULT_VIEWPORTS.map(v => v.name)).toEqual(['desktop', 'tablet', 'mobile']);
    });

    it('should have correct desktop dimensions', () => {
      const desktop = DEFAULT_VIEWPORTS.find(v => v.name === 'desktop');
      expect(desktop).toBeDefined();
      expect(desktop!.width).toBe(1440);
      expect(desktop!.height).toBe(900);
    });

    it('should have correct mobile dimensions', () => {
      const mobile = DEFAULT_VIEWPORTS.find(v => v.name === 'mobile');
      expect(mobile).toBeDefined();
      expect(mobile!.width).toBe(375);
      expect(mobile!.height).toBe(812);
    });
  });

  describe('options', () => {
    it('should use custom viewports', () => {
      const customCapturer = createScreenshotCapturer(TEST_OUTPUT_DIR, {
        viewports: [
          { name: 'custom', width: 1200, height: 800 },
        ],
      });

      const options = customCapturer.getOptions();
      expect(options.viewports).toHaveLength(1);
      expect(options.viewports[0].name).toBe('custom');
    });

    it('should use default options when none provided', () => {
      const defaultCapturer = createScreenshotCapturer(TEST_OUTPUT_DIR);
      const options = defaultCapturer.getOptions();

      expect(options.viewports).toEqual(DEFAULT_VIEWPORTS);
      expect(options.waitForNetworkIdle).toBe(true);
      expect(options.fullPage).toBe(true);
      expect(options.format).toBe('png');
    });
  });

  // Browser-dependent tests - require: npx playwright install-deps chromium
  describe.skipIf(!process.env.PLAYWRIGHT_DEPS)('capture (requires browser)', () => {
    let capturer: ScreenshotCapturer;

    beforeAll(async () => {
      capturer = createScreenshotCapturer(TEST_OUTPUT_DIR, {
        viewports: [{ name: 'test', width: 800, height: 600 }],
        waitAfterLoad: 100,
      });
    });

    afterAll(async () => {
      await capturer.close();
      try {
        await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
      } catch {}
    });

    it('should capture a screenshot', async () => {
      const result = await capturer.capture('https://example.com');
      expect(result.captures).toHaveLength(1);
    }, 30000);
  });
});
