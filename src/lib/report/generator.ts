/**
 * Diff Report Generator
 * 
 * Feature #4: Diff report generation
 * 
 * Generates actionable reports showing visual differences between
 * Figma designs and live implementations.
 */

import { writeFile, mkdir, readFile, copyFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import type { ComparisonResult, VisualDifference, Severity } from '../comparison/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ReportOptions {
  /** Output directory */
  outputDir?: string;
  /** Include embedded images (base64) */
  embedImages?: boolean;
  /** Project name for report title */
  projectName?: string;
  /** Include raw AI response */
  includeRawResponse?: boolean;
}

export interface ReportResult {
  jsonPath: string;
  htmlPath: string;
  timestamp: string;
}

export interface MultiPageReport {
  projectName: string;
  timestamp: string;
  summary: {
    totalPages: number;
    averageScore: number;
    passCount: number;
    failCount: number;
    totalDifferences: Record<Severity, number>;
  };
  pages: Array<{
    name: string;
    url: string;
    result: ComparisonResult;
    passed: boolean;
  }>;
}

// ============================================================================
// Report Generator
// ============================================================================

export class ReportGenerator {
  private outputDir: string;
  private options: Required<ReportOptions>;

  constructor(options: ReportOptions = {}) {
    this.outputDir = options.outputDir || './.parity-reports';
    this.options = {
      outputDir: this.outputDir,
      embedImages: options.embedImages ?? false,
      projectName: options.projectName || 'Parity Report',
      includeRawResponse: options.includeRawResponse ?? false,
    };
  }

  /**
   * Generate JSON and HTML reports for a single comparison
   */
  async generate(
    result: ComparisonResult,
    pageName: string = 'page'
  ): Promise<ReportResult> {
    await this.ensureOutputDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${pageName}_${timestamp}`;
    
    const jsonPath = join(this.outputDir, `${baseName}.json`);
    const htmlPath = join(this.outputDir, `${baseName}.html`);
    
    // Generate JSON report
    const jsonReport = this.generateJsonReport(result);
    await writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));
    
    // Generate HTML report
    const htmlReport = await this.generateHtmlReport(result, pageName);
    await writeFile(htmlPath, htmlReport);
    
    console.log(`[Report] Generated: ${htmlPath}`);
    
    return {
      jsonPath,
      htmlPath,
      timestamp,
    };
  }

  /**
   * Generate a multi-page report
   */
  async generateMultiPage(
    results: Array<{ name: string; url: string; result: ComparisonResult }>,
    thresholds: { minScore: number; maxHigh: number }
  ): Promise<ReportResult> {
    await this.ensureOutputDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `report_${timestamp}`;
    
    // Calculate summary
    const totalDifferences: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    
    let passCount = 0;
    const pagesWithStatus = results.map(({ name, url, result }) => {
      for (const diff of result.differences) {
        totalDifferences[diff.severity]++;
      }
      
      const highCount = result.differences.filter(d => 
        d.severity === 'critical' || d.severity === 'high'
      ).length;
      
      const passed = result.matchScore >= thresholds.minScore && 
                     highCount <= thresholds.maxHigh;
      
      if (passed) passCount++;
      
      return { name, url, result, passed };
    });
    
    const report: MultiPageReport = {
      projectName: this.options.projectName,
      timestamp: new Date().toISOString(),
      summary: {
        totalPages: results.length,
        averageScore: Math.round(
          results.reduce((sum, r) => sum + r.result.matchScore, 0) / results.length
        ),
        passCount,
        failCount: results.length - passCount,
        totalDifferences,
      },
      pages: pagesWithStatus,
    };
    
    const jsonPath = join(this.outputDir, `${baseName}.json`);
    const htmlPath = join(this.outputDir, `${baseName}.html`);
    
    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    await writeFile(htmlPath, await this.generateMultiPageHtml(report));
    
    return { jsonPath, htmlPath, timestamp };
  }

  // --------------------------------------------------------------------------
  // JSON Generation
  // --------------------------------------------------------------------------

  private generateJsonReport(result: ComparisonResult): object {
    const summary = {
      matchScore: result.matchScore,
      timestamp: result.timestamp,
      model: result.model,
      processingTime: result.processingTime,
      differenceCount: {
        total: result.differences.length,
        critical: result.differences.filter(d => d.severity === 'critical').length,
        high: result.differences.filter(d => d.severity === 'high').length,
        medium: result.differences.filter(d => d.severity === 'medium').length,
        low: result.differences.filter(d => d.severity === 'low').length,
      },
    };
    
    return {
      summary,
      images: {
        figma: result.figmaImage,
        live: result.liveImage,
      },
      differences: result.differences,
      annotations: result.annotations,
    };
  }

  // --------------------------------------------------------------------------
  // HTML Generation
  // --------------------------------------------------------------------------

  private async generateHtmlReport(
    result: ComparisonResult,
    pageName: string
  ): Promise<string> {
    const scoreColor = this.getScoreColor(result.matchScore);
    const diffsByType = this.groupDifferencesByType(result.differences);
    
    // Try to embed images if requested
    let figmaImageSrc = result.figmaImage;
    let liveImageSrc = result.liveImage;
    
    if (this.options.embedImages) {
      try {
        const figmaData = await readFile(result.figmaImage);
        figmaImageSrc = `data:image/png;base64,${figmaData.toString('base64')}`;
      } catch {}
      try {
        const liveData = await readFile(result.liveImage);
        liveImageSrc = `data:image/png;base64,${liveData.toString('base64')}`;
      } catch {}
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parity Report - ${pageName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { background: #1a1a2e; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    .score { font-size: 48px; font-weight: bold; color: ${scoreColor}; }
    .score-label { font-size: 14px; opacity: 0.8; }
    .meta { display: flex; gap: 20px; margin-top: 10px; font-size: 14px; opacity: 0.8; }
    .images { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .image-container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .image-container h3 { padding: 15px; background: #f8f8f8; border-bottom: 1px solid #eee; font-size: 14px; }
    .image-container img { width: 100%; height: auto; display: block; }
    .differences { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .differences h2 { margin-bottom: 15px; font-size: 18px; }
    .diff-item { border-left: 4px solid; padding: 15px; margin-bottom: 10px; background: #f8f8f8; border-radius: 0 8px 8px 0; }
    .diff-critical { border-color: #dc3545; }
    .diff-high { border-color: #fd7e14; }
    .diff-medium { border-color: #ffc107; }
    .diff-low { border-color: #6c757d; }
    .diff-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .diff-type { font-weight: 600; text-transform: uppercase; font-size: 12px; }
    .diff-severity { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .severity-critical { background: #dc3545; color: white; }
    .severity-high { background: #fd7e14; color: white; }
    .severity-medium { background: #ffc107; color: #333; }
    .severity-low { background: #6c757d; color: white; }
    .diff-description { margin-bottom: 8px; }
    .diff-values { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; }
    .diff-value { padding: 8px; background: white; border-radius: 4px; }
    .diff-value strong { display: block; font-size: 11px; opacity: 0.7; margin-bottom: 4px; }
    .suggestion { margin-top: 8px; padding: 8px; background: #e8f5e9; border-radius: 4px; font-size: 13px; }
    .annotations { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .annotations h2 { margin-bottom: 15px; font-size: 18px; }
    .annotations ul { padding-left: 20px; }
    .annotations li { margin-bottom: 8px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 15px; }
    .summary-item { text-align: center; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; }
    .summary-item .count { font-size: 24px; font-weight: bold; }
    .summary-item .label { font-size: 12px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.options.projectName} - ${pageName}</h1>
      <div class="score">${result.matchScore}%</div>
      <div class="score-label">Match Score</div>
      <div class="meta">
        <span>Model: ${result.model}</span>
        <span>Processing: ${result.processingTime}ms</span>
        <span>Generated: ${new Date().toLocaleString()}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-item">
          <div class="count" style="color: #dc3545">${result.differences.filter(d => d.severity === 'critical').length}</div>
          <div class="label">Critical</div>
        </div>
        <div class="summary-item">
          <div class="count" style="color: #fd7e14">${result.differences.filter(d => d.severity === 'high').length}</div>
          <div class="label">High</div>
        </div>
        <div class="summary-item">
          <div class="count" style="color: #ffc107">${result.differences.filter(d => d.severity === 'medium').length}</div>
          <div class="label">Medium</div>
        </div>
        <div class="summary-item">
          <div class="count" style="color: #6c757d">${result.differences.filter(d => d.severity === 'low').length}</div>
          <div class="label">Low</div>
        </div>
      </div>
    </header>

    <div class="images">
      <div class="image-container">
        <h3>📐 Figma Design</h3>
        <img src="${figmaImageSrc}" alt="Figma Design">
      </div>
      <div class="image-container">
        <h3>🌐 Live Website</h3>
        <img src="${liveImageSrc}" alt="Live Website">
      </div>
    </div>

    <div class="differences">
      <h2>📋 Differences (${result.differences.length})</h2>
      ${result.differences.map(diff => this.renderDifferenceItem(diff)).join('\n')}
      ${result.differences.length === 0 ? '<p style="color: #28a745; padding: 20px; text-align: center;">✅ No differences found!</p>' : ''}
    </div>

    ${result.annotations.length > 0 ? `
    <div class="annotations">
      <h2>📝 Annotations</h2>
      <ul>
        ${result.annotations.map(a => `<li>${a}</li>`).join('\n')}
      </ul>
    </div>
    ` : ''}
  </div>
</body>
</html>`;
  }

  private renderDifferenceItem(diff: VisualDifference): string {
    return `
      <div class="diff-item diff-${diff.severity}">
        <div class="diff-header">
          <span class="diff-type">${diff.type}</span>
          <span class="diff-severity severity-${diff.severity}">${diff.severity.toUpperCase()}</span>
        </div>
        <div class="diff-description">${diff.description}</div>
        ${diff.element ? `<div style="font-size: 12px; opacity: 0.7; margin-bottom: 8px;">Element: <code>${diff.element}</code></div>` : ''}
        ${diff.figmaValue || diff.liveValue ? `
        <div class="diff-values">
          ${diff.figmaValue ? `<div class="diff-value"><strong>Figma (Expected)</strong>${diff.figmaValue}</div>` : ''}
          ${diff.liveValue ? `<div class="diff-value"><strong>Live (Actual)</strong>${diff.liveValue}</div>` : ''}
        </div>
        ` : ''}
        ${diff.suggestion ? `<div class="suggestion">💡 ${diff.suggestion}</div>` : ''}
      </div>
    `;
  }

  private async generateMultiPageHtml(report: MultiPageReport): Promise<string> {
    const overallColor = this.getScoreColor(report.summary.averageScore);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.projectName} - Multi-Page Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { background: #1a1a2e; color: white; padding: 30px; margin-bottom: 20px; border-radius: 8px; text-align: center; }
    h1 { font-size: 28px; margin-bottom: 20px; }
    .overall-score { font-size: 64px; font-weight: bold; color: ${overallColor}; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 20px; }
    .stat { padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; }
    .stat-value { font-size: 28px; font-weight: bold; }
    .stat-label { font-size: 12px; opacity: 0.8; }
    .pages { display: grid; gap: 15px; }
    .page-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 20px; }
    .page-score { font-size: 32px; font-weight: bold; min-width: 80px; text-align: center; }
    .page-info { flex: 1; }
    .page-name { font-weight: 600; font-size: 18px; margin-bottom: 5px; }
    .page-url { font-size: 13px; color: #666; }
    .page-status { padding: 5px 15px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .status-pass { background: #d4edda; color: #155724; }
    .status-fail { background: #f8d7da; color: #721c24; }
    .page-diffs { display: flex; gap: 10px; margin-top: 10px; }
    .diff-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${report.projectName}</h1>
      <div class="overall-score">${report.summary.averageScore}%</div>
      <div>Average Match Score</div>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${report.summary.totalPages}</div>
          <div class="stat-label">Pages Tested</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: #28a745">${report.summary.passCount}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat">
          <div class="stat-value" style="color: #dc3545">${report.summary.failCount}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat">
          <div class="stat-value">${Object.values(report.summary.totalDifferences).reduce((a, b) => a + b, 0)}</div>
          <div class="stat-label">Total Issues</div>
        </div>
      </div>
    </header>

    <div class="pages">
      ${report.pages.map(page => `
        <div class="page-card">
          <div class="page-score" style="color: ${this.getScoreColor(page.result.matchScore)}">${page.result.matchScore}%</div>
          <div class="page-info">
            <div class="page-name">${page.name}</div>
            <div class="page-url">${page.url}</div>
            <div class="page-diffs">
              ${page.result.differences.filter(d => d.severity === 'critical').length > 0 ? `<span class="diff-badge" style="background: #dc3545; color: white">${page.result.differences.filter(d => d.severity === 'critical').length} critical</span>` : ''}
              ${page.result.differences.filter(d => d.severity === 'high').length > 0 ? `<span class="diff-badge" style="background: #fd7e14; color: white">${page.result.differences.filter(d => d.severity === 'high').length} high</span>` : ''}
              ${page.result.differences.filter(d => d.severity === 'medium').length > 0 ? `<span class="diff-badge" style="background: #ffc107">${page.result.differences.filter(d => d.severity === 'medium').length} medium</span>` : ''}
            </div>
          </div>
          <span class="page-status ${page.passed ? 'status-pass' : 'status-fail'}">${page.passed ? '✓ PASS' : '✗ FAIL'}</span>
        </div>
      `).join('\n')}
    </div>
  </div>
</body>
</html>`;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async ensureOutputDir(): Promise<void> {
    try {
      await mkdir(this.outputDir, { recursive: true });
    } catch {}
  }

  private getScoreColor(score: number): string {
    if (score >= 90) return '#28a745';
    if (score >= 75) return '#ffc107';
    if (score >= 50) return '#fd7e14';
    return '#dc3545';
  }

  private groupDifferencesByType(
    differences: VisualDifference[]
  ): Record<string, VisualDifference[]> {
    const grouped: Record<string, VisualDifference[]> = {};
    for (const diff of differences) {
      if (!grouped[diff.type]) grouped[diff.type] = [];
      grouped[diff.type].push(diff);
    }
    return grouped;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createReportGenerator(options?: ReportOptions): ReportGenerator {
  return new ReportGenerator(options);
}
