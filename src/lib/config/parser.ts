/**
 * Configuration Parser
 * 
 * Feature #9: Multi-page configuration
 * 
 * Parse .parity.yml config files to configure multiple pages,
 * viewports, and settings.
 */

import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ============================================================================
// Schemas
// ============================================================================

const ViewportSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const PageMappingSchema = z.object({
  name: z.string(),
  frame: z.string().optional(),
  url: z.string(),
  viewport: ViewportSchema.optional(),
  auth: z.boolean().optional(),
  waitFor: z.string().optional(),
  waitMs: z.number().optional(),
});

const ThresholdsSchema = z.object({
  visual_match: z.number().min(0).max(1).optional(),
  max_critical: z.number().int().min(0).optional(),
  max_high_severity: z.number().int().min(0).optional(),
  max_medium_severity: z.number().int().min(0).optional(),
  max_total: z.number().int().min(0).optional(),
});

const ChecksSchema = z.object({
  visual: z.boolean().optional(),
  accessibility: z.boolean().optional(),
  broken_links: z.boolean().optional(),
  js_errors: z.boolean().optional(),
  performance: z.boolean().optional(),
});

const FigmaConfigSchema = z.object({
  file: z.string(),
  pages: z.array(PageMappingSchema).optional(),
});

export const ParityConfigSchema = z.object({
  figma: FigmaConfigSchema,
  viewports: z.array(ViewportSchema).optional(),
  thresholds: ThresholdsSchema.optional(),
  checks: ChecksSchema.optional(),
  model: z.enum(['gpt-4o', 'gpt-4-vision', 'claude-sonnet', 'claude-opus']).optional(),
  output_dir: z.string().optional(),
  cache_dir: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

export type Viewport = z.infer<typeof ViewportSchema>;
export type PageMapping = z.infer<typeof PageMappingSchema>;
export type ParityThresholds = z.infer<typeof ThresholdsSchema>;
export type ParityChecks = z.infer<typeof ChecksSchema>;
export type ParityConfig = z.infer<typeof ParityConfigSchema>;

// ============================================================================
// Default Config
// ============================================================================

export const DEFAULT_CONFIG: Partial<ParityConfig> = {
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 812 },
  ],
  thresholds: {
    visual_match: 0.85,
    max_critical: 0,
    max_high_severity: 0,
    max_medium_severity: 5,
  },
  checks: {
    visual: true,
    accessibility: true,
    broken_links: true,
    js_errors: true,
    performance: false,
  },
  model: 'gpt-4o',
  output_dir: './.parity-reports',
  cache_dir: './.parity-cache',
};

// ============================================================================
// Config Parser
// ============================================================================

export class ConfigParser {
  /**
   * Load and parse config from file
   */
  async loadFile(path: string): Promise<ParityConfig> {
    const content = await readFile(path, 'utf-8');
    return this.parse(content, path);
  }

  /**
   * Parse config from string content
   */
  parse(content: string, filename: string = 'config'): ParityConfig {
    let parsed: unknown;

    if (filename.endsWith('.json')) {
      parsed = JSON.parse(content);
    } else {
      // YAML
      parsed = parseYaml(content);
    }

    // Validate with Zod
    const validated = ParityConfigSchema.parse(parsed);

    // Merge with defaults
    return this.mergeWithDefaults(validated);
  }

  /**
   * Merge config with defaults
   */
  mergeWithDefaults(config: ParityConfig): ParityConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      viewports: config.viewports || DEFAULT_CONFIG.viewports,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config.thresholds,
      },
      checks: {
        ...DEFAULT_CONFIG.checks,
        ...config.checks,
      },
    } as ParityConfig;
  }

  /**
   * Validate config object
   */
  validate(config: unknown): ParityConfig {
    return ParityConfigSchema.parse(config);
  }

  /**
   * Get pages to test
   */
  getPages(config: ParityConfig, baseUrl?: string): Array<PageMapping & { fullUrl: string }> {
    const pages = config.figma.pages || [];
    
    return pages.map(page => ({
      ...page,
      fullUrl: page.url.startsWith('http') 
        ? page.url 
        : `${baseUrl || ''}${page.url}`,
    }));
  }

  /**
   * Get viewports for a page
   */
  getViewports(config: ParityConfig, page?: PageMapping): Viewport[] {
    // Page-specific viewport takes precedence
    if (page?.viewport) {
      return [page.viewport];
    }
    
    return config.viewports || DEFAULT_CONFIG.viewports!;
  }

  /**
   * Convert config thresholds to checker format
   */
  toCheckerThresholds(config: ParityConfig): {
    minScore: number;
    maxCritical: number;
    maxHigh: number;
    maxMedium: number;
    maxTotal: number;
  } {
    const t = config.thresholds || {};
    return {
      minScore: (t.visual_match || 0.85) * 100,
      maxCritical: t.max_critical ?? 0,
      maxHigh: t.max_high_severity ?? 0,
      maxMedium: t.max_medium_severity ?? 5,
      maxTotal: t.max_total ?? 20,
    };
  }

  /**
   * Generate example config
   */
  static generateExample(): string {
    return `# Parity Configuration
# See: https://github.com/spencerht24/parity

figma:
  file: "your-figma-file-key"  # From Figma URL
  pages:
    - name: "Homepage"
      frame: "Desktop/Home"
      url: "/"
    - name: "Pricing"
      frame: "Desktop/Pricing"
      url: "/pricing"
    - name: "Dashboard"
      frame: "Desktop/Dashboard"
      url: "/app/dashboard"

viewports:
  - name: desktop
    width: 1440
    height: 900
  - name: tablet
    width: 768
    height: 1024
  - name: mobile
    width: 375
    height: 812

thresholds:
  visual_match: 0.85
  max_critical: 0
  max_high_severity: 0
  max_medium_severity: 5

checks:
  visual: true
  accessibility: true
  broken_links: true
  js_errors: true

model: gpt-4o
output_dir: ./.parity-reports
`;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConfigParser(): ConfigParser {
  return new ConfigParser();
}

/**
 * Quick load function
 */
export async function loadConfig(path: string): Promise<ParityConfig> {
  return new ConfigParser().loadFile(path);
}
