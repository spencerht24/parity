/**
 * Config Parser Tests
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  ConfigParser,
  createConfigParser,
  loadConfig,
  DEFAULT_CONFIG,
  ParityConfigSchema,
} from '../src/lib/config/index.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_CONFIG_DIR = './test-config-parser';

describe('ConfigParser', () => {
  const parser = createConfigParser();

  afterAll(async () => {
    try {
      await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('parse', () => {
    it('should parse JSON config', () => {
      const json = JSON.stringify({
        figma: {
          file: 'abc123',
          pages: [
            { name: 'Home', url: '/' },
          ],
        },
      });

      const config = parser.parse(json, 'config.json');

      expect(config.figma.file).toBe('abc123');
      expect(config.figma.pages).toHaveLength(1);
    });

    it('should parse YAML config', () => {
      const yaml = `
figma:
  file: xyz789
  pages:
    - name: Home
      url: /
    - name: About
      url: /about
`;

      const config = parser.parse(yaml, 'config.yml');

      expect(config.figma.file).toBe('xyz789');
      expect(config.figma.pages).toHaveLength(2);
    });

    it('should merge with defaults', () => {
      const config = parser.parse('figma:\n  file: test', 'config.yml');

      expect(config.viewports).toBeDefined();
      expect(config.viewports!.length).toBe(3);
      expect(config.thresholds?.visual_match).toBe(0.85);
      expect(config.checks?.visual).toBe(true);
    });

    it('should allow overriding defaults', () => {
      const config = parser.parse(`
figma:
  file: test
thresholds:
  visual_match: 0.95
  max_critical: 1
`, 'config.yml');

      expect(config.thresholds?.visual_match).toBe(0.95);
      expect(config.thresholds?.max_critical).toBe(1);
      // Defaults should still be present
      expect(config.thresholds?.max_high_severity).toBe(0);
    });

    it('should parse viewport configurations', () => {
      const config = parser.parse(`
figma:
  file: test
viewports:
  - name: custom
    width: 1920
    height: 1080
`, 'config.yml');

      expect(config.viewports).toHaveLength(1);
      expect(config.viewports![0].name).toBe('custom');
      expect(config.viewports![0].width).toBe(1920);
    });
  });

  describe('loadFile', () => {
    it('should load from file', async () => {
      await mkdir(TEST_CONFIG_DIR, { recursive: true });
      
      const configContent = `
figma:
  file: file-from-disk
  pages:
    - name: Test Page
      url: /test
`;
      await writeFile(join(TEST_CONFIG_DIR, 'parity.yml'), configContent);

      const config = await parser.loadFile(join(TEST_CONFIG_DIR, 'parity.yml'));

      expect(config.figma.file).toBe('file-from-disk');
    });
  });

  describe('validate', () => {
    it('should validate correct config', () => {
      const config = parser.validate({
        figma: {
          file: 'valid',
          pages: [{ name: 'Test', url: '/' }],
        },
      });

      expect(config.figma.file).toBe('valid');
    });

    it('should reject invalid config', () => {
      expect(() => parser.validate({
        figma: {},
      })).toThrow();
    });

    it('should reject invalid viewport dimensions', () => {
      expect(() => parser.validate({
        figma: { file: 'test' },
        viewports: [{ name: 'bad', width: -100, height: 0 }],
      })).toThrow();
    });
  });

  describe('getPages', () => {
    it('should return pages with full URLs', () => {
      const config = parser.parse(`
figma:
  file: test
  pages:
    - name: Home
      url: /
    - name: External
      url: https://other.com/page
`, 'config.yml');

      const pages = parser.getPages(config, 'https://example.com');

      expect(pages[0].fullUrl).toBe('https://example.com/');
      expect(pages[1].fullUrl).toBe('https://other.com/page');
    });
  });

  describe('getViewports', () => {
    it('should use page-specific viewport if provided', () => {
      const config = parser.parse('figma:\n  file: test', 'config.yml');
      const page = {
        name: 'Custom',
        url: '/',
        viewport: { name: 'custom', width: 800, height: 600 },
      };

      const viewports = parser.getViewports(config, page);

      expect(viewports).toHaveLength(1);
      expect(viewports[0].name).toBe('custom');
    });

    it('should use config viewports if no page viewport', () => {
      const config = parser.parse('figma:\n  file: test', 'config.yml');
      const page = { name: 'Default', url: '/' };

      const viewports = parser.getViewports(config, page);

      expect(viewports.length).toBe(3);
    });
  });

  describe('toCheckerThresholds', () => {
    it('should convert to checker format', () => {
      const config = parser.parse(`
figma:
  file: test
thresholds:
  visual_match: 0.9
  max_critical: 1
  max_high_severity: 3
`, 'config.yml');

      const thresholds = parser.toCheckerThresholds(config);

      expect(thresholds.minScore).toBe(90);
      expect(thresholds.maxCritical).toBe(1);
      expect(thresholds.maxHigh).toBe(3);
    });
  });

  describe('generateExample', () => {
    it('should generate valid example config', () => {
      const example = ConfigParser.generateExample();
      
      expect(example).toContain('figma:');
      expect(example).toContain('viewports:');
      expect(example).toContain('thresholds:');
      
      // Should be parseable
      const config = parser.parse(example, 'example.yml');
      expect(config.figma.file).toBeDefined();
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have all expected defaults', () => {
      expect(DEFAULT_CONFIG.viewports).toBeDefined();
      expect(DEFAULT_CONFIG.thresholds).toBeDefined();
      expect(DEFAULT_CONFIG.checks).toBeDefined();
      expect(DEFAULT_CONFIG.model).toBe('gpt-4o');
    });
  });
});

describe('loadConfig', () => {
  it('should be a convenience function', async () => {
    await mkdir(TEST_CONFIG_DIR, { recursive: true });
    await writeFile(
      join(TEST_CONFIG_DIR, 'quick.yml'),
      'figma:\n  file: quick-load'
    );

    const config = await loadConfig(join(TEST_CONFIG_DIR, 'quick.yml'));
    
    expect(config.figma.file).toBe('quick-load');
  });
});
