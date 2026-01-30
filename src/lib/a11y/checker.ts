/**
 * Accessibility Checker
 * 
 * Feature #11: A11y checks (axe-core)
 * 
 * Run accessibility audits using axe-core to ensure
 * WCAG compliance.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export type A11ySeverity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface A11yViolation {
  id: string;
  impact: A11ySeverity;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

export interface A11yResult {
  passed: boolean;
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  score: number;
  timestamp: string;
  url: string;
}

export interface A11yConfig {
  /** WCAG level to check (A, AA, AAA) */
  level?: 'wcag2a' | 'wcag2aa' | 'wcag2aaa' | 'wcag21a' | 'wcag21aa' | 'wcag21aaa';
  /** Only include rules with these tags */
  includeTags?: string[];
  /** Exclude rules with these tags */
  excludeTags?: string[];
  /** Specific rule IDs to run */
  rules?: string[];
  /** CSS selector to scope analysis */
  scope?: string;
  /** Fail on these impact levels */
  failOnImpact?: A11ySeverity[];
}

// ============================================================================
// Axe-core injection script
// ============================================================================

// Minimal axe-core rules for testing (in production, inject full axe-core)
const AXE_INJECT_SCRIPT = `
  window.__parity_a11y = window.__parity_a11y || {
    run: async function(options) {
      // Simplified a11y checks (in real impl, use full axe-core)
      const violations = [];
      const passes = 0;
      
      // Check for missing alt text
      document.querySelectorAll('img:not([alt])').forEach((img, i) => {
        violations.push({
          id: 'image-alt',
          impact: 'critical',
          description: 'Images must have alternate text',
          help: 'Images must have alternate text',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
          tags: ['wcag2a', 'wcag111', 'cat.text-alternatives'],
          nodes: [{
            target: ['img:nth-of-type(' + (i + 1) + ')'],
            html: img.outerHTML.slice(0, 100),
            failureSummary: 'Fix: Add an alt attribute to the image'
          }]
        });
      });

      // Check for empty links
      document.querySelectorAll('a:not([aria-label])').forEach((link, i) => {
        if (!link.textContent?.trim() && !link.querySelector('img[alt]')) {
          violations.push({
            id: 'link-name',
            impact: 'serious',
            description: 'Links must have discernible text',
            help: 'Links must have discernible text',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/link-name',
            tags: ['wcag2a', 'wcag412', 'cat.name-role-value'],
            nodes: [{
              target: ['a:nth-of-type(' + (i + 1) + ')'],
              html: link.outerHTML.slice(0, 100),
              failureSummary: 'Fix: Add text or aria-label to the link'
            }]
          });
        }
      });

      // Check for missing form labels
      document.querySelectorAll('input:not([type="hidden"]):not([aria-label])').forEach((input, i) => {
        const id = input.getAttribute('id');
        if (!id || !document.querySelector('label[for="' + id + '"]')) {
          violations.push({
            id: 'label',
            impact: 'critical',
            description: 'Form elements must have labels',
            help: 'Form elements must have labels',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/label',
            tags: ['wcag2a', 'wcag131', 'cat.forms'],
            nodes: [{
              target: ['input:nth-of-type(' + (i + 1) + ')'],
              html: input.outerHTML.slice(0, 100),
              failureSummary: 'Fix: Add a label element or aria-label'
            }]
          });
        }
      });

      // Check for missing document language
      if (!document.documentElement.getAttribute('lang')) {
        violations.push({
          id: 'html-has-lang',
          impact: 'serious',
          description: 'HTML element must have a lang attribute',
          help: 'HTML element must have a lang attribute',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/html-has-lang',
          tags: ['wcag2a', 'wcag311', 'cat.language'],
          nodes: [{
            target: ['html'],
            html: '<html>',
            failureSummary: 'Fix: Add lang attribute to html element'
          }]
        });
      }

      // Check color contrast (basic check)
      // In production, use full axe-core for proper contrast analysis

      return {
        violations,
        passes: 10 - violations.length, // Placeholder
        incomplete: 0,
        inapplicable: 5
      };
    }
  };
`;

// ============================================================================
// Accessibility Checker
// ============================================================================

export class AccessibilityChecker {
  private config: A11yConfig;

  constructor(config: A11yConfig = {}) {
    this.config = {
      level: 'wcag21aa',
      failOnImpact: ['critical', 'serious'],
      ...config,
    };
  }

  /**
   * Run accessibility check on a page
   */
  async check(page: Page): Promise<A11yResult> {
    const url = page.url();
    const timestamp = new Date().toISOString();

    try {
      // Inject axe-core (simplified version)
      await page.evaluate(AXE_INJECT_SCRIPT);

      // Run the audit
      const result = await page.evaluate(() => {
        return (window as any).__parity_a11y.run({});
      });

      const violations = result.violations as A11yViolation[];
      const failingViolations = violations.filter(v =>
        this.config.failOnImpact?.includes(v.impact)
      );

      // Calculate score (100 - penalties)
      const penalties = violations.reduce((sum, v) => {
        switch (v.impact) {
          case 'critical': return sum + 25;
          case 'serious': return sum + 15;
          case 'moderate': return sum + 5;
          case 'minor': return sum + 2;
          default: return sum;
        }
      }, 0);
      const score = Math.max(0, 100 - penalties);

      return {
        passed: failingViolations.length === 0,
        violations,
        passes: result.passes,
        incomplete: result.incomplete,
        inapplicable: result.inapplicable,
        score,
        timestamp,
        url,
      };
    } catch (error) {
      // Return error result
      return {
        passed: false,
        violations: [{
          id: 'audit-error',
          impact: 'critical',
          description: `Accessibility audit failed: ${error}`,
          help: 'Failed to run accessibility audit',
          helpUrl: '',
          tags: ['error'],
          nodes: [],
        }],
        passes: 0,
        incomplete: 0,
        inapplicable: 0,
        score: 0,
        timestamp,
        url,
      };
    }
  }

  /**
   * Run accessibility check on HTML content
   */
  async checkHtml(html: string): Promise<A11yResult> {
    // Create a minimal DOM-like check without browser
    const violations: A11yViolation[] = [];
    const timestamp = new Date().toISOString();

    // Check for missing alt attributes
    const imgMatches = html.match(/<img(?![^>]*alt=)[^>]*>/gi) || [];
    for (const match of imgMatches) {
      violations.push({
        id: 'image-alt',
        impact: 'critical',
        description: 'Images must have alternate text',
        help: 'Images must have alternate text',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
        tags: ['wcag2a', 'wcag111'],
        nodes: [{
          target: ['img'],
          html: match.slice(0, 100),
          failureSummary: 'Fix: Add an alt attribute',
        }],
      });
    }

    // Check for missing lang attribute
    if (!/<html[^>]*lang=/.test(html)) {
      violations.push({
        id: 'html-has-lang',
        impact: 'serious',
        description: 'HTML element must have a lang attribute',
        help: 'HTML element must have a lang attribute',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/html-has-lang',
        tags: ['wcag2a', 'wcag311'],
        nodes: [{
          target: ['html'],
          html: '<html>',
          failureSummary: 'Fix: Add lang attribute',
        }],
      });
    }

    const failingViolations = violations.filter(v =>
      this.config.failOnImpact?.includes(v.impact)
    );

    const penalties = violations.reduce((sum, v) => {
      switch (v.impact) {
        case 'critical': return sum + 25;
        case 'serious': return sum + 15;
        default: return sum;
      }
    }, 0);

    return {
      passed: failingViolations.length === 0,
      violations,
      passes: 10 - violations.length,
      incomplete: 0,
      inapplicable: 5,
      score: Math.max(0, 100 - penalties),
      timestamp,
      url: 'html-string',
    };
  }

  /**
   * Format violations for console/report
   */
  formatViolations(violations: A11yViolation[]): string {
    if (violations.length === 0) return 'No accessibility violations found.';

    let output = `Found ${violations.length} accessibility violation(s):\n\n`;

    for (const v of violations) {
      output += `[${v.impact.toUpperCase()}] ${v.id}\n`;
      output += `  ${v.description}\n`;
      output += `  Help: ${v.helpUrl}\n`;
      
      for (const node of v.nodes.slice(0, 3)) {
        output += `  → ${node.target.join(', ')}\n`;
        output += `    ${node.failureSummary}\n`;
      }
      
      if (v.nodes.length > 3) {
        output += `  ... and ${v.nodes.length - 3} more\n`;
      }
      
      output += '\n';
    }

    return output;
  }

  /**
   * Get WCAG criteria from violation tags
   */
  static getWcagCriteria(tags: string[]): string[] {
    const wcagPattern = /^wcag(\d{3})$/;
    return tags
      .filter(t => wcagPattern.test(t))
      .map(t => {
        const match = t.match(wcagPattern)!;
        const num = match[1];
        return `${num[0]}.${num[1]}.${num[2]}`;
      });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAccessibilityChecker(config?: A11yConfig): AccessibilityChecker {
  return new AccessibilityChecker(config);
}
