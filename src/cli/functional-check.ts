#!/usr/bin/env tsx
/**
 * CLI: Parity Phase 3 Functional Checks
 *
 * Run broken link detection, console error monitoring,
 * and performance metrics against a URL.
 *
 * Usage:
 *   npm run functional -- --url https://example.com
 *   npm run functional -- --url https://example.com --no-links --no-perf
 */

import { runFunctionalChecks } from '../lib/functional/runner.js';
import { generateFunctionalReport } from '../lib/functional/report.js';
import { join } from 'path';

// --------------------------------------------------------------------------
// Parse args
// --------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.findIndex((a) => a === `--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const url = getArg('url');
const outputDir = getArg('output') || './.parity-reports';
const skipLinks = hasFlag('no-links');
const skipConsole = hasFlag('no-console');
const skipPerf = hasFlag('no-perf');

if (!url) {
  console.error('Usage: npm run functional -- --url <url> [--output <dir>] [--no-links] [--no-console] [--no-perf]');
  process.exit(1);
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------

console.log(`\n🧪 Parity Phase 3 Functional Checks`);
console.log(`   URL: ${url}`);
console.log(`   Checks: ${[
  !skipLinks ? '🔗 broken-links' : '',
  !skipConsole ? '⚠️  console-errors' : '',
  !skipPerf ? '⚡ performance' : '',
].filter(Boolean).join(', ')}\n`);

(async () => {
  try {
    const result = await runFunctionalChecks(url, {
      brokenLinks: skipLinks ? false : { checkExternal: true, concurrency: 10 },
      consoleErrors: skipConsole ? false : undefined,
      performance: skipPerf ? false : undefined,
    });

    // Summary
    console.log('\n📊 Results:');
    if (result.brokenLinks) {
      const bl = result.brokenLinks;
      console.log(`  🔗 Broken Links: ${bl.status.toUpperCase()} — ${bl.broken} broken, ${bl.warnings} warnings, ${bl.totalChecked} total`);
    }
    if (result.consoleErrors) {
      const ce = result.consoleErrors;
      console.log(`  ⚠️  Console Errors: ${ce.status.toUpperCase()} — ${ce.errorCount} errors, ${ce.exceptionCount} exceptions, ${ce.warnCount} warnings`);
    }
    if (result.performance) {
      const p = result.performance;
      console.log(`  ⚡ Performance: ${p.summary.status.toUpperCase()} — score ${p.summary.score}/100`);
      if (p.metrics.lcp) console.log(`     LCP: ${p.metrics.lcp.value}ms (${p.metrics.lcp.rating})`);
      if (p.metrics.ttfb) console.log(`     TTFB: ${p.metrics.ttfb.value}ms (${p.metrics.ttfb.rating})`);
      if (p.metrics.fcp) console.log(`     FCP: ${p.metrics.fcp.value}ms (${p.metrics.fcp.rating})`);
    }

    console.log(`\n  Overall: ${result.overallStatus.toUpperCase()}`);

    // Generate report
    const report = await generateFunctionalReport(result, outputDir);
    console.log(`\n📄 Report: ${report.htmlPath}`);
    console.log(`   JSON:   ${report.jsonPath}`);

    if (!result.overallPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
