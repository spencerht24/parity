/**
 * GitHub Action Integration
 * 
 * Feature #6: GitHub Action package
 * 
 * Provides the core functionality for the Parity GitHub Action.
 * Teams should be able to add UX fidelity checks to CI in < 5 minutes.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createFigmaClient, type ExportedFrame } from '../figma/index.js';
import { createScreenshotCapturer, type CapturedPage } from '../screenshot/index.js';
import { createComparisonEngine, type ComparisonResult } from '../comparison/index.js';
import { createReportGenerator, type ReportResult } from '../report/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ActionConfig {
  /** Figma file key */
  figmaFile: string;
  /** Figma API token */
  figmaToken: string;
  /** Target URL to test */
  targetUrl: string;
  /** Path to config file */
  configPath?: string;
  /** Output directory for reports */
  outputDir?: string;
  /** Thresholds for pass/fail */
  thresholds?: {
    minScore?: number;
    maxCritical?: number;
    maxHigh?: number;
    maxMedium?: number;
  };
  /** AI model for comparison */
  model?: 'gpt-4o' | 'gpt-4-vision' | 'claude-sonnet' | 'claude-opus';
  /** API key for AI model */
  aiApiKey?: string;
}

export interface PageMapping {
  name: string;
  figmaFrame: string;
  url: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface ParityConfig {
  figma: {
    file: string;
    pages: PageMapping[];
  };
  viewports?: Array<{
    name: string;
    width: number;
    height: number;
  }>;
  thresholds?: {
    visual_match?: number;
    max_critical?: number;
    max_high_severity?: number;
    max_medium_severity?: number;
  };
  checks?: {
    visual?: boolean;
    accessibility?: boolean;
    broken_links?: boolean;
    js_errors?: boolean;
  };
}

export interface ActionResult {
  success: boolean;
  matchScore: number;
  passed: boolean;
  summary: {
    pagesChecked: number;
    totalDifferences: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  reportUrl?: string;
  reportPath: string;
  failureReasons: string[];
  pages: Array<{
    name: string;
    url: string;
    matchScore: number;
    passed: boolean;
    differences: number;
  }>;
}

// ============================================================================
// Config Parser
// ============================================================================

export async function loadConfig(configPath: string): Promise<ParityConfig> {
  const content = await readFile(configPath, 'utf-8');
  
  // Support both JSON and YAML
  if (configPath.endsWith('.json')) {
    return JSON.parse(content);
  }
  
  // Simple YAML-like parsing for basic config
  // In production, use a proper YAML parser
  const config: Partial<ParityConfig> = {
    figma: { file: '', pages: [] },
    viewports: [],
    thresholds: {},
    checks: {},
  };
  
  const lines = content.split('\n');
  let currentSection = '';
  let currentPage: Partial<PageMapping> | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Section headers
    if (trimmed === 'figma:') { currentSection = 'figma'; continue; }
    if (trimmed === 'viewports:') { currentSection = 'viewports'; continue; }
    if (trimmed === 'thresholds:') { currentSection = 'thresholds'; continue; }
    if (trimmed === 'checks:') { currentSection = 'checks'; continue; }
    if (trimmed === 'pages:') { currentSection = 'figma-pages'; continue; }
    
    // Parse key-value pairs
    const match = trimmed.match(/^-?\s*(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      const cleanValue = value.replace(/["']/g, '');
      
      if (currentSection === 'figma' && key === 'file') {
        config.figma!.file = cleanValue;
      } else if (currentSection === 'thresholds') {
        (config.thresholds as any)[key] = parseFloat(cleanValue);
      } else if (currentSection === 'checks') {
        (config.checks as any)[key] = cleanValue === 'true';
      }
    }
    
    // Handle page list items
    if (trimmed.startsWith('- name:') && currentSection === 'figma-pages') {
      if (currentPage) {
        config.figma!.pages.push(currentPage as PageMapping);
      }
      currentPage = { name: trimmed.replace('- name:', '').trim().replace(/["']/g, '') };
    } else if (currentPage && trimmed.startsWith('frame:')) {
      currentPage.figmaFrame = trimmed.replace('frame:', '').trim().replace(/["']/g, '');
    } else if (currentPage && trimmed.startsWith('url:')) {
      currentPage.url = trimmed.replace('url:', '').trim().replace(/["']/g, '');
    }
  }
  
  if (currentPage) {
    config.figma!.pages.push(currentPage as PageMapping);
  }
  
  return config as ParityConfig;
}

// ============================================================================
// Action Runner
// ============================================================================

export class ActionRunner {
  private config: ActionConfig;

  constructor(config: ActionConfig) {
    this.config = {
      outputDir: './.parity-reports',
      thresholds: {
        minScore: 85,
        maxCritical: 0,
        maxHigh: 0,
        maxMedium: 5,
      },
      model: 'gpt-4o',
      ...config,
    };
  }

  /**
   * Run the full Parity check
   */
  async run(): Promise<ActionResult> {
    console.log('🎯 Parity GitHub Action\n');
    
    const startTime = Date.now();
    const result: ActionResult = {
      success: true,
      matchScore: 0,
      passed: true,
      summary: {
        pagesChecked: 0,
        totalDifferences: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      reportPath: '',
      failureReasons: [],
      pages: [],
    };

    try {
      // Load config if provided
      let pages: PageMapping[] = [];
      if (this.config.configPath) {
        const parityConfig = await loadConfig(this.config.configPath);
        pages = parityConfig.pages || [];
        
        // Apply config thresholds
        if (parityConfig.thresholds) {
          this.config.thresholds = {
            minScore: parityConfig.thresholds.visual_match,
            maxCritical: parityConfig.thresholds.max_critical,
            maxHigh: parityConfig.thresholds.max_high_severity,
            maxMedium: parityConfig.thresholds.max_medium_severity,
          };
        }
      }
      
      // Default to single page if no config
      if (pages.length === 0) {
        pages = [{
          name: 'Default',
          figmaFrame: '',
          url: this.config.targetUrl,
        }];
      }

      // Initialize clients
      const figmaClient = createFigmaClient({
        token: this.config.figmaToken,
        cacheDir: join(this.config.outputDir!, 'figma-cache'),
      });
      
      const screenshotCapturer = createScreenshotCapturer(
        join(this.config.outputDir!, 'screenshots')
      );
      
      const comparisonEngine = createComparisonEngine({
        model: this.config.model,
        apiKey: this.config.aiApiKey,
      });
      
      const reportGenerator = createReportGenerator({
        outputDir: this.config.outputDir,
        projectName: 'Parity CI Check',
      });

      // Export Figma frames
      console.log('📐 Exporting Figma frames...');
      const figmaFrames = await figmaClient.exportAllFrames(this.config.figmaFile, {
        maxFrames: pages.length * 2,
        downloadImages: true,
      });

      // Process each page
      const pageResults: Array<{ name: string; url: string; result: ComparisonResult }> = [];
      
      for (const page of pages) {
        console.log(`\n🔍 Checking: ${page.name} (${page.url})`);
        
        try {
          // Capture screenshot
          const captureResult = await screenshotCapturer.capture(
            page.url.startsWith('http') ? page.url : `${this.config.targetUrl}${page.url}`,
            {
              viewports: page.viewport 
                ? [{ name: 'custom', ...page.viewport }]
                : [{ name: 'desktop', width: 1440, height: 900 }],
            }
          );
          
          if (captureResult.captures.length === 0) {
            throw new Error('Screenshot capture failed');
          }
          
          const liveScreenshot = captureResult.captures[0];
          
          // Find matching Figma frame
          const figmaFrame = figmaFrames.find(f => 
            f.name.toLowerCase().includes(page.name.toLowerCase()) ||
            f.path.toLowerCase().includes(page.figmaFrame?.toLowerCase() || '')
          );
          
          if (!figmaFrame?.localPath) {
            console.log(`  ⚠️ No Figma frame found for "${page.name}"`);
            continue;
          }
          
          // Run comparison
          const comparisonResult = await comparisonEngine.compare(
            figmaFrame.localPath,
            liveScreenshot.screenshotPath
          );
          
          pageResults.push({
            name: page.name,
            url: page.url,
            result: comparisonResult,
          });
          
          // Update summary
          result.summary.pagesChecked++;
          result.summary.totalDifferences += comparisonResult.differences.length;
          result.summary.critical += comparisonResult.differences.filter(d => d.severity === 'critical').length;
          result.summary.high += comparisonResult.differences.filter(d => d.severity === 'high').length;
          result.summary.medium += comparisonResult.differences.filter(d => d.severity === 'medium').length;
          result.summary.low += comparisonResult.differences.filter(d => d.severity === 'low').length;
          
          // Check page pass/fail
          const pagePassed = comparisonResult.matchScore >= (this.config.thresholds!.minScore || 85) &&
            comparisonResult.differences.filter(d => d.severity === 'critical').length <= (this.config.thresholds!.maxCritical || 0) &&
            comparisonResult.differences.filter(d => d.severity === 'high').length <= (this.config.thresholds!.maxHigh || 0);
          
          result.pages.push({
            name: page.name,
            url: page.url,
            matchScore: comparisonResult.matchScore,
            passed: pagePassed,
            differences: comparisonResult.differences.length,
          });
          
          console.log(`  ${pagePassed ? '✅' : '❌'} Score: ${comparisonResult.matchScore}% | Differences: ${comparisonResult.differences.length}`);
          
        } catch (error) {
          console.error(`  ❌ Error: ${error instanceof Error ? error.message : error}`);
          result.pages.push({
            name: page.name,
            url: page.url,
            matchScore: 0,
            passed: false,
            differences: -1,
          });
        }
      }

      await screenshotCapturer.close();

      // Generate report
      if (pageResults.length > 0) {
        console.log('\n📊 Generating report...');
        const report = await reportGenerator.generateMultiPage(
          pageResults,
          {
            minScore: this.config.thresholds!.minScore || 85,
            maxHigh: this.config.thresholds!.maxHigh || 0,
          }
        );
        result.reportPath = report.htmlPath;
      }

      // Calculate overall result
      if (result.summary.pagesChecked > 0) {
        result.matchScore = Math.round(
          result.pages.reduce((sum, p) => sum + p.matchScore, 0) / result.pages.length
        );
      }

      // Check thresholds
      const thresholds = this.config.thresholds!;
      
      if (thresholds.minScore && result.matchScore < thresholds.minScore) {
        result.passed = false;
        result.failureReasons.push(`Match score ${result.matchScore}% below threshold ${thresholds.minScore}%`);
      }
      
      if (thresholds.maxCritical !== undefined && result.summary.critical > thresholds.maxCritical) {
        result.passed = false;
        result.failureReasons.push(`${result.summary.critical} critical issues (max: ${thresholds.maxCritical})`);
      }
      
      if (thresholds.maxHigh !== undefined && result.summary.high > thresholds.maxHigh) {
        result.passed = false;
        result.failureReasons.push(`${result.summary.high} high severity issues (max: ${thresholds.maxHigh})`);
      }

      // Print summary
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`\n${result.passed ? '✅ PASSED' : '❌ FAILED'} (${elapsed}s)\n`);
      console.log(`  Match Score: ${result.matchScore}%`);
      console.log(`  Pages: ${result.summary.pagesChecked}`);
      console.log(`  Differences: ${result.summary.totalDifferences}`);
      console.log(`    Critical: ${result.summary.critical}`);
      console.log(`    High: ${result.summary.high}`);
      console.log(`    Medium: ${result.summary.medium}`);
      console.log(`    Low: ${result.summary.low}`);
      
      if (result.failureReasons.length > 0) {
        console.log(`\n  Failure Reasons:`);
        for (const reason of result.failureReasons) {
          console.log(`    - ${reason}`);
        }
      }
      
      if (result.reportPath) {
        console.log(`\n  Report: ${result.reportPath}`);
      }

    } catch (error) {
      result.success = false;
      result.passed = false;
      result.failureReasons.push(error instanceof Error ? error.message : String(error));
      console.error('\n❌ Action failed:', error);
    }

    return result;
  }

  /**
   * Output for GitHub Actions
   */
  outputGitHub(result: ActionResult): void {
    // Set output variables
    console.log(`::set-output name=match-score::${result.matchScore}`);
    console.log(`::set-output name=passed::${result.passed}`);
    console.log(`::set-output name=report-path::${result.reportPath}`);
    console.log(`::set-output name=issues-count::${result.summary.totalDifferences}`);
    
    // Set job status
    if (!result.passed) {
      console.log(`::error::Parity check failed: ${result.failureReasons.join(', ')}`);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createActionRunner(config: ActionConfig): ActionRunner {
  return new ActionRunner(config);
}
