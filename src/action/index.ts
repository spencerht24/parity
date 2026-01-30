/**
 * GitHub Action Entry Point
 * 
 * This is the main entry for the GitHub Action.
 * It reads inputs, runs Parity, and sets outputs.
 */

import { createActionRunner } from '../lib/action/index.js';

async function run(): Promise<void> {
  // In GitHub Actions, inputs come from environment variables
  const figmaToken = process.env.INPUT_FIGMA_TOKEN || process.env.FIGMA_TOKEN;
  const figmaFile = process.env.INPUT_FIGMA_FILE || process.env.FIGMA_FILE;
  const targetUrl = process.env.INPUT_TARGET_URL || process.env.TARGET_URL;
  const configPath = process.env.INPUT_CONFIG || '.parity.yml';
  const model = (process.env.INPUT_MODEL || 'gpt-4o') as any;
  const aiApiKey = process.env.INPUT_OPENAI_API_KEY || 
                   process.env.OPENAI_API_KEY ||
                   process.env.INPUT_ANTHROPIC_API_KEY ||
                   process.env.ANTHROPIC_API_KEY;

  if (!figmaToken) {
    console.error('::error::figma-token is required');
    process.exit(1);
  }

  if (!figmaFile) {
    console.error('::error::figma-file is required');
    process.exit(1);
  }

  if (!targetUrl) {
    console.error('::error::target-url is required');
    process.exit(1);
  }

  const runner = createActionRunner({
    figmaFile,
    figmaToken,
    targetUrl,
    configPath,
    model,
    aiApiKey,
    outputDir: './.parity-reports',
  });

  const result = await runner.run();
  
  // Output GitHub Actions format
  runner.outputGitHub(result);

  // Exit with error if failed
  if (!result.passed) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('::error::' + (error instanceof Error ? error.message : error));
  process.exit(1);
});
