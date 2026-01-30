/**
 * Accessibility Checker Tests
 */

import { describe, it, expect } from 'vitest';
import {
  AccessibilityChecker,
  createAccessibilityChecker,
} from '../src/lib/a11y/index.js';

describe('AccessibilityChecker', () => {
  const checker = createAccessibilityChecker();

  describe('checkHtml', () => {
    it('should pass for accessible HTML', async () => {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <img src="test.png" alt="Test image">
  <a href="/">Home</a>
  <form>
    <label for="name">Name</label>
    <input id="name" type="text" aria-label="Name">
  </form>
</body>
</html>
      `;

      const result = await checker.checkHtml(html);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should detect missing alt attributes', async () => {
      const html = `
<!DOCTYPE html>
<html lang="en">
<body>
  <img src="test.png">
</body>
</html>
      `;

      const result = await checker.checkHtml(html);

      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.id === 'image-alt')).toBe(true);
    });

    it('should detect missing lang attribute', async () => {
      const html = `
<!DOCTYPE html>
<html>
<body>
  <p>Content</p>
</body>
</html>
      `;

      const result = await checker.checkHtml(html);

      expect(result.violations.some(v => v.id === 'html-has-lang')).toBe(true);
    });

    it('should calculate accessibility score', async () => {
      // One critical violation (25 penalty)
      const html = '<html><body><img src="x"></body></html>';

      const result = await checker.checkHtml(html);

      expect(result.score).toBeLessThan(100);
      // Score should be 75 or less (25 penalty for critical)
      expect(result.score).toBeLessThanOrEqual(75);
    });

    it('should include violation details', async () => {
      const html = '<html><body><img src="x"></body></html>';

      const result = await checker.checkHtml(html);
      const violation = result.violations.find(v => v.id === 'image-alt');

      expect(violation).toBeDefined();
      expect(violation!.impact).toBe('critical');
      expect(violation!.helpUrl).toContain('dequeuniversity');
      expect(violation!.tags).toContain('wcag2a');
    });
  });

  describe('formatViolations', () => {
    it('should format violations for output', async () => {
      const html = '<html><body><img src="x"></body></html>';
      const result = await checker.checkHtml(html);
      
      const formatted = checker.formatViolations(result.violations);

      expect(formatted).toContain('CRITICAL');
      expect(formatted).toContain('image-alt');
      expect(formatted).toContain('alternate text');
    });

    it('should return no violations message when clean', async () => {
      const formatted = checker.formatViolations([]);
      expect(formatted).toContain('No accessibility violations');
    });
  });

  describe('config', () => {
    it('should respect custom fail impact levels', async () => {
      const lenientChecker = createAccessibilityChecker({
        failOnImpact: ['critical'], // Only fail on critical
      });

      // HTML with only serious violation (missing lang)
      const html = '<html><body><p>Test</p></body></html>';
      
      const result = await lenientChecker.checkHtml(html);
      
      // Should pass since missing lang is "serious", not "critical"
      expect(result.passed).toBe(true);
    });
  });

  describe('getWcagCriteria', () => {
    it('should extract WCAG criteria from tags', () => {
      const tags = ['wcag2a', 'wcag111', 'cat.text-alternatives'];
      const criteria = AccessibilityChecker.getWcagCriteria(tags);

      expect(criteria).toContain('1.1.1');
    });

    it('should handle multiple criteria', () => {
      const tags = ['wcag111', 'wcag412', 'wcag311'];
      const criteria = AccessibilityChecker.getWcagCriteria(tags);

      expect(criteria).toHaveLength(3);
      expect(criteria).toContain('1.1.1');
      expect(criteria).toContain('4.1.2');
      expect(criteria).toContain('3.1.1');
    });
  });

  describe('result structure', () => {
    it('should include all expected fields', async () => {
      const result = await checker.checkHtml('<html lang="en"></html>');

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('passes');
      expect(result).toHaveProperty('incomplete');
      expect(result).toHaveProperty('inapplicable');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('url');
    });
  });
});
