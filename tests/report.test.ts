/**
 * Report Generator Tests
 */

import { describe, it, expect, afterAll } from 'vitest';
import { ReportGenerator, createReportGenerator } from '../src/lib/report/index.js';
import type { ComparisonResult } from '../src/lib/comparison/index.js';
import { rm, readFile, access } from 'fs/promises';

const TEST_OUTPUT_DIR = './test-reports';

const mockResult: ComparisonResult = {
  matchScore: 87,
  timestamp: new Date().toISOString(),
  figmaImage: '/path/to/figma.png',
  liveImage: '/path/to/live.png',
  differences: [
    {
      type: 'typography',
      severity: 'high',
      element: 'h1.hero-title',
      description: 'Font size differs by 6px',
      figmaValue: '48px',
      liveValue: '42px',
      suggestion: 'Update font-size to 48px in CSS',
    },
    {
      type: 'color',
      severity: 'medium',
      description: 'Button color slightly different',
      figmaValue: '#2563eb',
      liveValue: '#3b82f6',
    },
    {
      type: 'spacing',
      severity: 'low',
      description: 'Minor padding difference',
    },
  ],
  annotations: ['Overall good match', 'Typography needs attention'],
  processingTime: 2500,
  model: 'gpt-4o',
};

describe('ReportGenerator', () => {
  afterAll(async () => {
    try {
      await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('generate', () => {
    it('should generate JSON and HTML reports', async () => {
      const generator = createReportGenerator({
        outputDir: TEST_OUTPUT_DIR,
        projectName: 'Test Project',
      });

      const result = await generator.generate(mockResult, 'homepage');

      // Check files were created
      await expect(access(result.jsonPath)).resolves.toBeUndefined();
      await expect(access(result.htmlPath)).resolves.toBeUndefined();
      
      expect(result.jsonPath).toContain('homepage');
      expect(result.htmlPath).toContain('homepage');
    });

    it('should include summary in JSON report', async () => {
      const generator = createReportGenerator({ outputDir: TEST_OUTPUT_DIR });
      const result = await generator.generate(mockResult, 'test-page');
      
      const json = JSON.parse(await readFile(result.jsonPath, 'utf-8'));
      
      expect(json.summary).toBeDefined();
      expect(json.summary.matchScore).toBe(87);
      expect(json.summary.differenceCount.total).toBe(3);
      expect(json.summary.differenceCount.high).toBe(1);
      expect(json.summary.differenceCount.medium).toBe(1);
      expect(json.summary.differenceCount.low).toBe(1);
    });

    it('should include differences in JSON report', async () => {
      const generator = createReportGenerator({ outputDir: TEST_OUTPUT_DIR });
      const result = await generator.generate(mockResult, 'diff-test');
      
      const json = JSON.parse(await readFile(result.jsonPath, 'utf-8'));
      
      expect(json.differences).toHaveLength(3);
      expect(json.differences[0].type).toBe('typography');
      expect(json.differences[0].suggestion).toBeDefined();
    });

    it('should generate valid HTML', async () => {
      const generator = createReportGenerator({ outputDir: TEST_OUTPUT_DIR });
      const result = await generator.generate(mockResult, 'html-test');
      
      const html = await readFile(result.htmlPath, 'utf-8');
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Parity Report');
      expect(html).toContain('87%');
      expect(html).toContain('Font size differs by 6px');
      expect(html).toContain('Critical');
      expect(html).toContain('High');
    });
  });

  describe('generateMultiPage', () => {
    it('should aggregate multiple page results', async () => {
      const generator = createReportGenerator({
        outputDir: TEST_OUTPUT_DIR,
        projectName: 'Multi-Page Test',
      });

      const results = [
        { name: 'Homepage', url: '/', result: { ...mockResult, matchScore: 95 } },
        { name: 'About', url: '/about', result: { ...mockResult, matchScore: 82 } },
        { name: 'Contact', url: '/contact', result: { ...mockResult, matchScore: 78 } },
      ];

      const report = await generator.generateMultiPage(results, {
        minScore: 80,
        maxHigh: 2,
      });

      const json = JSON.parse(await readFile(report.jsonPath, 'utf-8'));
      
      expect(json.summary.totalPages).toBe(3);
      expect(json.summary.averageScore).toBe(85);
      expect(json.summary.passCount).toBe(2);
      expect(json.summary.failCount).toBe(1);
    });

    it('should generate multi-page HTML', async () => {
      const generator = createReportGenerator({ outputDir: TEST_OUTPUT_DIR });
      
      const results = [
        { name: 'Page 1', url: '/p1', result: { ...mockResult, matchScore: 70 } }, // Will fail
        { name: 'Page 2', url: '/p2', result: { ...mockResult, matchScore: 92 } }, // Will pass
      ];

      const report = await generator.generateMultiPage(results, {
        minScore: 85,
        maxHigh: 10,
      });

      const html = await readFile(report.htmlPath, 'utf-8');
      
      expect(html).toContain('Page 1');
      expect(html).toContain('Page 2');
      expect(html).toContain('PASS');
      expect(html).toContain('FAIL');
    });
  });

  describe('factory', () => {
    it('should create generator with default options', () => {
      const generator = createReportGenerator();
      expect(generator).toBeInstanceOf(ReportGenerator);
    });

    it('should create generator with custom options', () => {
      const generator = createReportGenerator({
        outputDir: './custom-reports',
        embedImages: true,
        projectName: 'My Project',
      });
      expect(generator).toBeInstanceOf(ReportGenerator);
    });
  });
});
