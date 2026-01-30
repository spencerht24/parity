#!/usr/bin/env tsx
/**
 * CLI: Screenshot Capture
 * 
 * Usage:
 *   parity screenshot <url> [options]
 * 
 * Example:
 *   parity screenshot https://example.com --output ./screenshots
 */

import { createScreenshotCapturer, DEFAULT_VIEWPORTS } from '../lib/screenshot/index.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

function parseViewports(viewportArg: string) {
  if (viewportArg === 'all') {
    return DEFAULT_VIEWPORTS;
  }
  
  const names = viewportArg.split(',');
  return DEFAULT_VIEWPORTS.filter(v => names.includes(v.name));
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Parity - Screenshot Capture

Usage:
  npx tsx src/cli/screenshot.ts <url> [options]

Arguments:
  url         The URL to capture

Options:
  --output    Output directory (default: ./.parity-cache/screenshots)
  --viewports Comma-separated viewports: desktop,tablet,mobile (default: all)
  --full-page Capture full page (default: true)
  --wait      Additional wait time in ms after load (default: 500)
  --selector  Wait for this selector before capture
  --format    Image format: png or jpeg (default: png)
  --json      Output capture data as JSON
  --no-errors Don't capture console errors

Examples:
  npx tsx src/cli/screenshot.ts https://example.com
  npx tsx src/cli/screenshot.ts https://example.com --viewports mobile,desktop
  npx tsx src/cli/screenshot.ts https://example.com --wait 2000 --selector "#main"
`);
    process.exit(0);
  }

  const url = args[0];
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.error('❌ URL must start with http:// or https://');
    process.exit(1);
  }

  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : './.parity-cache/screenshots';
  
  const viewportsArg = args.includes('--viewports')
    ? args[args.indexOf('--viewports') + 1]
    : 'all';
  
  const fullPage = !args.includes('--no-full-page');
  
  const waitAfterLoad = args.includes('--wait')
    ? parseInt(args[args.indexOf('--wait') + 1])
    : 500;
  
  const waitForSelector = args.includes('--selector')
    ? args[args.indexOf('--selector') + 1]
    : '';
  
  const format = args.includes('--format')
    ? args[args.indexOf('--format') + 1] as 'png' | 'jpeg'
    : 'png';
  
  const jsonOutput = args.includes('--json');
  const captureErrors = !args.includes('--no-errors');

  const viewports = parseViewports(viewportsArg);

  try {
    console.log('📸 Parity - Screenshot Capture\n');
    console.log(`URL: ${url}`);
    console.log(`Viewports: ${viewports.map(v => v.name).join(', ')}`);
    console.log(`Output: ${outputDir}`);
    console.log(`Full page: ${fullPage}`);
    console.log('');

    const capturer = createScreenshotCapturer(outputDir, {
      viewports,
      fullPage,
      waitAfterLoad,
      waitForSelector,
      format,
      captureConsoleErrors: captureErrors,
      captureNetworkFailures: captureErrors,
    });

    const startTime = Date.now();
    const result = await capturer.capture(url);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    await capturer.close();

    console.log(`\n✅ Captured ${result.captures.length} screenshots in ${elapsed}s\n`);

    if (result.errors.length > 0) {
      console.log('⚠️ Errors:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
      console.log('');
    }

    if (jsonOutput) {
      await mkdir(outputDir, { recursive: true });
      const jsonPath = join(outputDir, 'captures.json');
      await writeFile(jsonPath, JSON.stringify(result, null, 2));
      console.log(`📄 Capture data saved to ${jsonPath}`);
    } else {
      // Display summary
      console.log('Screenshots:');
      for (const capture of result.captures) {
        console.log(`  ✓ ${capture.viewport.name}: ${capture.screenshotPath}`);
        console.log(`    Load time: ${capture.loadTime}ms`);
        
        if (capture.consoleErrors.length > 0) {
          console.log(`    ⚠️ Console errors: ${capture.consoleErrors.length}`);
        }
        if (capture.networkFailures.length > 0) {
          console.log(`    ❌ Network failures: ${capture.networkFailures.length}`);
        }
      }
    }

    // Show any console errors found
    const allErrors = result.captures.flatMap(c => c.consoleErrors);
    if (allErrors.length > 0 && !jsonOutput) {
      console.log('\n📋 Console Errors Found:');
      for (const error of allErrors.slice(0, 5)) {
        console.log(`  [${error.type}] ${error.text.slice(0, 100)}`);
      }
      if (allErrors.length > 5) {
        console.log(`  ... and ${allErrors.length - 5} more`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
