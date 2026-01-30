/**
 * Threshold Checker Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ThresholdChecker,
  createThresholdChecker,
  quickCheck,
  DEFAULT_THRESHOLDS,
  STRICT_THRESHOLDS,
  LENIENT_THRESHOLDS,
} from '../src/lib/checks/index.js';
import type { ComparisonResult } from '../src/lib/comparison/index.js';

const createMockResult = (
  score: number,
  differences: Array<{ severity: 'critical' | 'high' | 'medium' | 'low' }>
): ComparisonResult => ({
  matchScore: score,
  timestamp: new Date().toISOString(),
  figmaImage: '/figma.png',
  liveImage: '/live.png',
  differences: differences.map((d, i) => ({
    type: 'typography',
    severity: d.severity,
    description: `Issue ${i + 1}`,
  })),
  annotations: [],
  processingTime: 1000,
  model: 'gpt-4o',
});

describe('ThresholdChecker', () => {
  describe('check', () => {
    it('should pass when all thresholds are met', () => {
      const checker = createThresholdChecker();
      const result = checker.check(createMockResult(90, []));

      expect(result.passed).toBe(true);
      expect(result.status).toBe('success');
      expect(result.failureReasons).toHaveLength(0);
    });

    it('should fail when score is below threshold', () => {
      const checker = createThresholdChecker({ minScore: 90 });
      const result = checker.check(createMockResult(85, []));

      expect(result.passed).toBe(false);
      expect(result.status).toBe('failure');
      expect(result.failureReasons[0]).toContain('85%');
      expect(result.failureReasons[0]).toContain('90%');
    });

    it('should fail when critical issues exceed threshold', () => {
      const checker = createThresholdChecker({ maxCritical: 0 });
      const result = checker.check(createMockResult(90, [{ severity: 'critical' }]));

      expect(result.passed).toBe(false);
      expect(result.failureReasons[0]).toContain('critical');
    });

    it('should fail when high issues exceed threshold', () => {
      const checker = createThresholdChecker({ maxHigh: 1 });
      const result = checker.check(createMockResult(90, [
        { severity: 'high' },
        { severity: 'high' },
      ]));

      expect(result.passed).toBe(false);
      expect(result.failureReasons[0]).toContain('high');
    });

    it('should pass with medium/low issues within threshold', () => {
      const checker = createThresholdChecker({ maxMedium: 5, maxTotal: 10 });
      const result = checker.check(createMockResult(90, [
        { severity: 'medium' },
        { severity: 'low' },
        { severity: 'low' },
      ]));

      expect(result.passed).toBe(true);
    });

    it('should warn when close to thresholds', () => {
      const checker = createThresholdChecker({ minScore: 85, maxMedium: 5 });
      const result = checker.check(createMockResult(87, [
        { severity: 'medium' },
        { severity: 'medium' },
        { severity: 'medium' },
        { severity: 'medium' },
      ]));

      expect(result.passed).toBe(true);
      expect(result.status).toBe('warning');
      expect(result.warningReasons.length).toBeGreaterThan(0);
    });

    it('should count issues correctly', () => {
      const checker = createThresholdChecker();
      const result = checker.check(createMockResult(90, [
        { severity: 'critical' },
        { severity: 'high' },
        { severity: 'high' },
        { severity: 'medium' },
        { severity: 'low' },
      ]));

      expect(result.issues.critical).toBe(1);
      expect(result.issues.high).toBe(2);
      expect(result.issues.medium).toBe(1);
      expect(result.issues.low).toBe(1);
      expect(result.issues.total).toBe(5);
    });
  });

  describe('checkMultiple', () => {
    it('should check multiple pages', () => {
      const checker = createThresholdChecker();
      const result = checker.checkMultiple([
        { name: 'Homepage', result: createMockResult(95, []) },
        { name: 'About', result: createMockResult(88, [{ severity: 'medium' }]) },
      ]);

      expect(result.passed).toBe(true);
      expect(result.summary.totalPages).toBe(2);
      expect(result.summary.passedPages).toBe(2);
      expect(result.averageScore).toBe(92);
    });

    it('should fail if any page fails', () => {
      const checker = createThresholdChecker({ maxCritical: 0 });
      const result = checker.checkMultiple([
        { name: 'Homepage', result: createMockResult(95, []) },
        { name: 'About', result: createMockResult(88, [{ severity: 'critical' }]) },
      ]);

      expect(result.passed).toBe(false);
      expect(result.summary.failedPages).toBe(1);
      expect(result.failureReasons[0]).toContain('About');
    });
  });

  describe('presets', () => {
    it('should have correct default thresholds', () => {
      expect(DEFAULT_THRESHOLDS.minScore).toBe(85);
      expect(DEFAULT_THRESHOLDS.maxCritical).toBe(0);
      expect(DEFAULT_THRESHOLDS.maxHigh).toBe(0);
    });

    it('should have stricter strict thresholds', () => {
      expect(STRICT_THRESHOLDS.minScore).toBeGreaterThan(DEFAULT_THRESHOLDS.minScore);
      expect(STRICT_THRESHOLDS.maxMedium).toBeLessThan(DEFAULT_THRESHOLDS.maxMedium);
    });

    it('should have more lenient lenient thresholds', () => {
      expect(LENIENT_THRESHOLDS.minScore).toBeLessThan(DEFAULT_THRESHOLDS.minScore);
      expect(LENIENT_THRESHOLDS.maxHigh).toBeGreaterThan(DEFAULT_THRESHOLDS.maxHigh);
    });
  });

  describe('quickCheck', () => {
    it('should work as a simple function', () => {
      const result = quickCheck(createMockResult(90, []));
      expect(result.passed).toBe(true);
    });

    it('should accept custom thresholds', () => {
      const result = quickCheck(createMockResult(90, []), { minScore: 95 });
      expect(result.passed).toBe(false);
    });
  });

  describe('formatForGitHub', () => {
    it('should format failure correctly', () => {
      const checker = createThresholdChecker();
      const checkResult = checker.check(createMockResult(70, []));
      const formatted = ThresholdChecker.formatForGitHub(checkResult);

      expect(formatted).toContain('::error::');
    });

    it('should format success correctly', () => {
      const checker = createThresholdChecker();
      const checkResult = checker.check(createMockResult(95, []));
      const formatted = ThresholdChecker.formatForGitHub(checkResult);

      expect(formatted).toContain('::notice::');
      expect(formatted).toContain('95%');
    });
  });
});
