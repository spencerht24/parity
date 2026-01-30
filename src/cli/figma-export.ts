#!/usr/bin/env tsx
/**
 * CLI: Figma Frame Export
 * 
 * Usage:
 *   parity figma-export <file-key> [options]
 * 
 * Example:
 *   parity figma-export abc123xyz --output ./exports
 */

import { createFigmaClient } from '../lib/figma/index.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

async function loadToken(): Promise<string> {
  // Try environment variable first
  if (process.env.FIGMA_TOKEN) {
    return process.env.FIGMA_TOKEN;
  }

  // Try config file
  const configPaths = [
    join(process.env.HOME || '', '.config/figma/token'),
    '.figma-token',
  ];

  for (const path of configPaths) {
    try {
      const token = await readFile(path, 'utf-8');
      return token.trim();
    } catch {
      // Try next path
    }
  }

  throw new Error(
    'Figma token not found. Set FIGMA_TOKEN env var or create ~/.config/figma/token'
  );
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Parity - Figma Frame Export

Usage:
  npx tsx src/cli/figma-export.ts <file-key> [options]

Arguments:
  file-key    The Figma file key (from the URL)

Options:
  --output    Output directory (default: ./.parity-cache/figma)
  --max       Maximum frames to export (default: 100)
  --no-cache  Don't cache images locally
  --json      Output frame data as JSON

Example:
  npx tsx src/cli/figma-export.ts abc123xyz --output ./exports
`);
    process.exit(0);
  }

  const fileKey = args[0];
  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : './.parity-cache/figma';
  const maxFrames = args.includes('--max')
    ? parseInt(args[args.indexOf('--max') + 1])
    : 100;
  const downloadImages = !args.includes('--no-cache');
  const jsonOutput = args.includes('--json');

  try {
    console.log('🎨 Parity - Figma Frame Export\n');
    
    const token = await loadToken();
    console.log('✓ Figma token loaded');

    const client = createFigmaClient({
      token,
      cacheDir: outputDir,
    });

    console.log(`\nExporting frames from ${fileKey}...`);
    console.log(`  Max frames: ${maxFrames}`);
    console.log(`  Download images: ${downloadImages}`);
    console.log(`  Output: ${outputDir}\n`);

    const startTime = Date.now();
    const frames = await client.exportAllFrames(fileKey, {
      maxFrames,
      downloadImages,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Exported ${frames.length} frames in ${elapsed}s\n`);

    if (jsonOutput) {
      const jsonPath = join(outputDir, 'frames.json');
      await mkdir(outputDir, { recursive: true });
      await writeFile(jsonPath, JSON.stringify(frames, null, 2));
      console.log(`📄 Frame data saved to ${jsonPath}`);
    } else {
      // Display summary
      console.log('Frames:');
      for (const frame of frames.slice(0, 20)) {
        const cached = frame.localPath ? '✓' : '○';
        console.log(`  ${cached} ${frame.path}`);
        console.log(`    ${frame.width}x${frame.height}`);
      }
      if (frames.length > 20) {
        console.log(`  ... and ${frames.length - 20} more`);
      }
    }

    // Extract design tokens
    console.log('\n📐 Extracting design tokens...');
    const tokens = await client.extractDesignTokens(fileKey);
    console.log(`  Colors: ${tokens.colors.length}`);
    console.log(`  Typography: ${tokens.typography.length}`);

    if (jsonOutput) {
      const tokensPath = join(outputDir, 'tokens.json');
      await writeFile(tokensPath, JSON.stringify(tokens, null, 2));
      console.log(`📄 Tokens saved to ${tokensPath}`);
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
