/**
 * GitHub Action Tests
 */

import { describe, it, expect } from 'vitest';
import { ActionRunner, createActionRunner, loadConfig } from '../src/lib/action/index.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_CONFIG_DIR = './test-action-config';

describe('GitHub Action', () => {
  describe('loadConfig', () => {
    it('should load JSON config', async () => {
      await mkdir(TEST_CONFIG_DIR, { recursive: true });
      
      const config = {
        figma: {
          file: 'abc123',
          pages: [
            { name: 'Homepage', figmaFrame: 'Desktop/Home', url: '/' },
            { name: 'About', figmaFrame: 'Desktop/About', url: '/about' },
          ],
        },
        thresholds: {
          visual_match: 0.85,
          max_critical: 0,
          max_high_severity: 2,
        },
      };
      
      await writeFile(join(TEST_CONFIG_DIR, 'parity.json'), JSON.stringify(config));
      
      const loaded = await loadConfig(join(TEST_CONFIG_DIR, 'parity.json'));
      
      expect(loaded.figma.file).toBe('abc123');
      expect(loaded.figma.pages).toHaveLength(2);
      expect(loaded.figma.pages[0].name).toBe('Homepage');
      expect(loaded.thresholds?.visual_match).toBe(0.85);
      
      await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    });

    it('should load YAML-like config', async () => {
      await mkdir(TEST_CONFIG_DIR, { recursive: true });
      
      const yamlContent = `
figma:
  file: "xyz789"

thresholds:
  visual_match: 0.90
  max_critical: 0

checks:
  visual: true
  accessibility: true
`;
      
      await writeFile(join(TEST_CONFIG_DIR, 'parity.yml'), yamlContent);
      
      const loaded = await loadConfig(join(TEST_CONFIG_DIR, 'parity.yml'));
      
      expect(loaded.figma.file).toBe('xyz789');
      expect(loaded.thresholds?.visual_match).toBe(0.90);
      expect(loaded.checks?.visual).toBe(true);
      
      await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    });
  });

  describe('ActionRunner', () => {
    it('should create runner with config', () => {
      const runner = createActionRunner({
        figmaFile: 'test-file',
        figmaToken: 'test-token',
        targetUrl: 'https://example.com',
        thresholds: {
          minScore: 90,
          maxCritical: 0,
        },
      });

      expect(runner).toBeInstanceOf(ActionRunner);
    });

    it('should use default thresholds', () => {
      const runner = createActionRunner({
        figmaFile: 'test-file',
        figmaToken: 'test-token',
        targetUrl: 'https://example.com',
      });

      expect(runner).toBeInstanceOf(ActionRunner);
    });
  });

  describe('ActionResult', () => {
    it('should have correct structure', () => {
      const result = {
        success: true,
        matchScore: 92,
        passed: true,
        summary: {
          pagesChecked: 2,
          totalDifferences: 5,
          critical: 0,
          high: 1,
          medium: 3,
          low: 1,
        },
        reportPath: './report.html',
        failureReasons: [],
        pages: [
          { name: 'Home', url: '/', matchScore: 95, passed: true, differences: 2 },
          { name: 'About', url: '/about', matchScore: 89, passed: true, differences: 3 },
        ],
      };

      expect(result.success).toBe(true);
      expect(result.matchScore).toBe(92);
      expect(result.summary.pagesChecked).toBe(2);
      expect(result.pages).toHaveLength(2);
    });
  });
});
