/**
 * Phase 3 Functional Check HTML Report Generator
 *
 * Generates a standalone HTML report showing PASS/WARN/FAIL badges
 * for broken links, console errors, and performance metrics.
 * Can be used standalone or embedded in the unified Parity report.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { FunctionalCheckResult } from './runner.js';
import type { LinkCheckResult } from './broken-links.js';
import type { CapturedConsoleEvent } from './console-monitor.js';
import type { MetricValue } from './performance.js';

// ============================================================================
// Status Badge Helpers
// ============================================================================

function badge(status: 'pass' | 'warn' | 'fail'): string {
  const styles: Record<string, string> = {
    pass: 'background:#28a745;color:#fff',
    warn: 'background:#ffc107;color:#333',
    fail: 'background:#dc3545;color:#fff',
  };
  const icons = { pass: '✓ PASS', warn: '⚠ WARN', fail: '✗ FAIL' };
  return `<span class="badge" style="${styles[status]}">${icons[status]}</span>`;
}

function severityBadge(severity: string): string {
  const styles: Record<string, string> = {
    critical: 'background:#dc3545;color:#fff',
    high: 'background:#fd7e14;color:#fff',
    medium: 'background:#ffc107;color:#333',
    low: 'background:#6c757d;color:#fff',
    pass: 'background:#28a745;color:#fff',
    info: 'background:#17a2b8;color:#fff',
  };
  const style = styles[severity] || styles.low;
  return `<span class="badge" style="${style}">${severity.toUpperCase()}</span>`;
}

function ratingBadge(rating: string): string {
  const styles: Record<string, string> = {
    good: 'background:#28a745;color:#fff',
    'needs-improvement': 'background:#ffc107;color:#333',
    poor: 'background:#dc3545;color:#fff',
  };
  const style = styles[rating] || '';
  return `<span class="badge" style="${style}">${rating}</span>`;
}

// ============================================================================
// Section Renderers
// ============================================================================

function renderBrokenLinks(result: FunctionalCheckResult): string {
  const bl = result.brokenLinks;
  if (!bl) return '<p class="na">Broken link detection was not run.</p>';

  const broken = bl.results.filter((r) => r.severity === 'critical' || r.severity === 'high');
  const warnings = bl.results.filter((r) => r.severity === 'medium' || r.severity === 'low');
  const passed = bl.results.filter((r) => r.severity === 'pass');

  return `
    <div class="section-header">
      <div class="section-stats">
        <div class="stat-pill" style="background:#dc3545">${broken.length} broken</div>
        <div class="stat-pill" style="background:#ffc107;color:#333">${warnings.length} warn</div>
        <div class="stat-pill" style="background:#28a745">${passed.length} ok</div>
        <div class="stat-pill" style="background:#6c757d">${bl.totalChecked} total</div>
      </div>
    </div>

    ${bl.results.length === 0
      ? '<p class="empty">No links found on the page.</p>'
      : `
    <table class="results-table">
      <thead>
        <tr>
          <th>URL</th>
          <th>Type</th>
          <th>Status</th>
          <th>Severity</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${bl.results
          .filter((r) => r.severity !== 'pass')
          .concat(broken.length + warnings.length === 0 ? bl.results.slice(0, 5) : [])
          .map(
            (r: LinkCheckResult) => `
          <tr class="row-${r.severity}">
            <td class="url-cell"><a href="${r.url}" target="_blank" title="${r.url}">${truncate(r.url, 60)}</a></td>
            <td>${r.type}</td>
            <td>${r.status === 0 ? 'Error' : r.status}</td>
            <td>${severityBadge(r.severity)}</td>
            <td>${r.error ? r.error : r.redirectHops ? `${r.redirectHops} redirects` : ''}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
    ${bl.results.filter((r) => r.severity === 'pass').length > 0 && broken.length + warnings.length > 0
      ? `<p class="note">${bl.results.filter((r) => r.severity === 'pass').length} additional links checked and passed (not shown).</p>`
      : ''}
    `}
  `;
}

function renderConsoleErrors(result: FunctionalCheckResult): string {
  const ce = result.consoleErrors;
  if (!ce) return '<p class="na">Console error monitoring was not run.</p>';

  const criticalEvents = ce.events.filter((e) => e.severity === 'critical' || e.severity === 'high');
  const warnEvents = ce.events.filter((e) => e.severity === 'medium');

  return `
    <div class="section-header">
      <div class="section-stats">
        <div class="stat-pill" style="background:#dc3545">${ce.bySeverity.critical + ce.bySeverity.high} errors</div>
        <div class="stat-pill" style="background:#ffc107;color:#333">${ce.bySeverity.medium} warnings</div>
        <div class="stat-pill" style="background:#17a2b8">${ce.exceptionCount} exceptions</div>
      </div>
    </div>

    ${ce.events.length === 0
      ? '<p class="empty" style="color:#28a745">✅ No console errors captured.</p>'
      : `
    <div class="event-list">
      ${ce.events.map((e: CapturedConsoleEvent) => `
        <div class="event-item event-${e.type}">
          <div class="event-header">
            <span class="event-type">${e.type.toUpperCase()}</span>
            ${severityBadge(e.severity)}
            ${e.isThirdParty ? '<span class="badge" style="background:#6c757d;color:#fff">3rd-party</span>' : ''}
            <span class="event-time">${new Date(e.timestamp).toISOString().slice(11, 23)}</span>
          </div>
          <div class="event-message"><code>${escapeHtml(e.message.slice(0, 300))}</code></div>
          ${e.source ? `<div class="event-source">Source: <code>${escapeHtml(e.source)}</code></div>` : ''}
        </div>
      `).join('')}
    </div>
    `}
  `;
}

function renderPerformance(result: FunctionalCheckResult): string {
  const perf = result.performance;
  if (!perf) return '<p class="na">Performance metrics were not collected.</p>';

  const metricRows: Array<[string, MetricValue | undefined]> = [
    ['LCP (Largest Contentful Paint)', perf.metrics.lcp],
    ['FCP (First Contentful Paint)', perf.metrics.fcp],
    ['TTFB (Time to First Byte)', perf.metrics.ttfb],
    ['CLS (Cumulative Layout Shift)', perf.metrics.cls],
    ['FID (First Input Delay)', perf.metrics.fid],
    ['INP (Interaction to Next Paint)', perf.metrics.inp],
    ['DOM Content Loaded', perf.metrics.domContentLoaded],
    ['Load Event', perf.metrics.loadEvent],
    ['DOM Interactive', perf.metrics.domInteractive],
  ];

  return `
    <div class="section-header">
      <div class="perf-score">
        <div class="score-ring" style="border-color: ${scoreColor(perf.summary.score)}">
          <span class="score-value">${perf.summary.score}</span>
          <span class="score-label">/ 100</span>
        </div>
        <div class="score-meta">
          <div>Performance Score</div>
          <div class="section-stats" style="margin-top: 8px">
            ${perf.summary.failedMetrics.length > 0
              ? `<div class="stat-pill" style="background:#dc3545">${perf.summary.failedMetrics.length} failing</div>`
              : ''}
            ${perf.summary.warnedMetrics.length > 0
              ? `<div class="stat-pill" style="background:#ffc107;color:#333">${perf.summary.warnedMetrics.length} needs-improvement</div>`
              : ''}
          </div>
        </div>
      </div>
    </div>

    <table class="results-table">
      <thead>
        <tr><th>Metric</th><th>Value</th><th>Rating</th><th>Thresholds</th></tr>
      </thead>
      <tbody>
        ${metricRows
          .filter(([, v]) => v !== undefined)
          .map(([name, v]) => `
          <tr class="${v!.rating === 'poor' ? 'row-critical' : v!.rating === 'needs-improvement' ? 'row-medium' : ''}">
            <td>${name}</td>
            <td><strong>${v!.unit === 'score' ? v!.value.toFixed(3) : v!.value + 'ms'}</strong></td>
            <td>${ratingBadge(v!.rating)}</td>
            <td style="color:#666;font-size:12px">Good: &lt;${v!.unit === 'score' ? v!.threshold.good : v!.threshold.good + 'ms'} · Poor: &gt;${v!.unit === 'score' ? v!.threshold.poor : v!.threshold.poor + 'ms'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============================================================================
// HTML Report
// ============================================================================

export async function generateFunctionalReport(
  result: FunctionalCheckResult,
  outputDir: string = './.parity-reports'
): Promise<{ jsonPath: string; htmlPath: string }> {
  await mkdir(outputDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = new URL(result.url).hostname.replace(/\./g, '_');
  const baseName = `functional_${slug}_${ts}`;

  const jsonPath = join(outputDir, `${baseName}.json`);
  const htmlPath = join(outputDir, `${baseName}.html`);

  await writeFile(jsonPath, JSON.stringify(result, null, 2));
  await writeFile(htmlPath, buildHtml(result));

  console.log(`[FunctionalReport] Generated: ${htmlPath}`);
  return { jsonPath, htmlPath };
}

function buildHtml(result: FunctionalCheckResult): string {
  const overallStatus = result.overallStatus;
  const statusColor = { pass: '#28a745', warn: '#ffc107', fail: '#dc3545' }[overallStatus];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parity Functional Report — ${escapeHtml(result.url)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    header { background: #1a1a2e; color: white; padding: 28px 32px; border-radius: 12px; margin-bottom: 24px; }
    h1 { font-size: 22px; margin-bottom: 6px; }
    .url { font-size: 14px; opacity: 0.75; word-break: break-all; }
    .overall-badge { display: inline-block; margin-top: 16px; padding: 8px 24px; border-radius: 24px; font-size: 20px; font-weight: bold; background: ${statusColor}; color: ${overallStatus === 'warn' ? '#333' : '#fff'}; }
    .meta { margin-top: 12px; font-size: 13px; opacity: 0.7; display: flex; gap: 20px; flex-wrap: wrap; }

    /* Tabs */
    .tabs { display: flex; gap: 4px; margin-bottom: -1px; position: relative; z-index: 1; }
    .tab { padding: 10px 20px; border: 1px solid #ddd; border-bottom: none; background: #f0f0f0; cursor: pointer; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 500; transition: background 0.15s; }
    .tab:hover { background: #e0e0e0; }
    .tab.active { background: white; border-bottom-color: white; }
    .tab-content { display: none; background: white; border: 1px solid #ddd; border-radius: 0 8px 8px 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .tab-content.active { display: block; }

    /* Shared */
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .na { color: #999; font-style: italic; padding: 16px 0; }
    .empty { padding: 16px 0; font-size: 15px; }
    .note { margin-top: 10px; font-size: 13px; color: #666; }
    .section-header { margin-bottom: 16px; }
    .section-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .stat-pill { padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #fff; }

    /* Table */
    .results-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    .results-table th { background: #f8f8f8; padding: 10px 12px; text-align: left; border-bottom: 2px solid #eee; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .results-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
    .results-table tr:last-child td { border-bottom: none; }
    .row-critical td { background: #fff5f5; }
    .row-high td { background: #fff9f0; }
    .row-medium td { background: #fffef0; }
    .url-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Console events */
    .event-list { display: flex; flex-direction: column; gap: 10px; }
    .event-item { border-left: 4px solid #ddd; padding: 12px 16px; background: #fafafa; border-radius: 0 8px 8px 0; }
    .event-error { border-color: #dc3545; background: #fff5f5; }
    .event-warn { border-color: #ffc107; background: #fffef0; }
    .event-exception { border-color: #9c1c1c; background: #fff0f0; }
    .event-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .event-type { font-weight: 700; font-size: 12px; text-transform: uppercase; }
    .event-time { font-size: 11px; color: #999; margin-left: auto; }
    .event-message code { font-family: 'Fira Code', 'Consolas', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
    .event-source { margin-top: 4px; font-size: 11px; color: #666; }

    /* Perf score ring */
    .perf-score { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
    .score-ring { width: 80px; height: 80px; border-radius: 50%; border: 6px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .score-value { font-size: 24px; font-weight: bold; line-height: 1; }
    .score-label { font-size: 10px; color: #666; }
  </style>
  <script>
    function showTab(id) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + id).classList.add('active');
      document.getElementById('content-' + id).classList.add('active');
    }
  </script>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧪 Parity Functional Report</h1>
      <div class="url">${escapeHtml(result.url)}</div>
      <div class="overall-badge">${result.overallStatus === 'pass' ? '✓ ALL CHECKS PASSED' : result.overallStatus === 'warn' ? '⚠ WARNINGS FOUND' : '✗ CHECKS FAILED'}</div>
      <div class="meta">
        <span>Checked: ${new Date(result.timestamp).toLocaleString()}</span>
        <span>Duration: ${(result.durationMs / 1000).toFixed(1)}s</span>
        ${result.brokenLinks ? `<span>Links: ${result.brokenLinks.totalChecked} checked</span>` : ''}
        ${result.consoleErrors ? `<span>Console: ${result.consoleErrors.events.length} events</span>` : ''}
      </div>
    </header>

    <!-- Summary row -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
      <div style="background:white;border-radius:8px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);text-align:center">
        <div style="font-size:13px;color:#666;margin-bottom:6px">🔗 Broken Links</div>
        ${result.brokenLinks ? badge(result.brokenLinks.status) : '<span class="badge" style="background:#ccc;color:#333">–</span>'}
      </div>
      <div style="background:white;border-radius:8px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);text-align:center">
        <div style="font-size:13px;color:#666;margin-bottom:6px">⚠️ Console Errors</div>
        ${result.consoleErrors ? badge(result.consoleErrors.status) : '<span class="badge" style="background:#ccc;color:#333">–</span>'}
      </div>
      <div style="background:white;border-radius:8px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);text-align:center">
        <div style="font-size:13px;color:#666;margin-bottom:6px">⚡ Performance</div>
        ${result.performance ? badge(result.performance.summary.status) : '<span class="badge" style="background:#ccc;color:#333">–</span>'}
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" id="tab-links" onclick="showTab('links')">🔗 Broken Links</button>
      <button class="tab" id="tab-console" onclick="showTab('console')">⚠️ Console Errors</button>
      <button class="tab" id="tab-perf" onclick="showTab('perf')">⚡ Performance</button>
    </div>

    <div class="tab-content active" id="content-links">
      ${renderBrokenLinks(result)}
    </div>
    <div class="tab-content" id="content-console">
      ${renderConsoleErrors(result)}
    </div>
    <div class="tab-content" id="content-perf">
      ${renderPerformance(result)}
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, n: number): string {
  return s.length > n ? '…' + s.slice(-(n - 1)) : s;
}

function scoreColor(score: number): string {
  if (score >= 90) return '#28a745';
  if (score >= 50) return '#ffc107';
  return '#dc3545';
}
