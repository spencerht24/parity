#!/usr/bin/env tsx
/**
 * CLI: Dashboard Server
 * 
 * Usage:
 *   parity dashboard [options]
 * 
 * Example:
 *   parity dashboard --port 8080 --reports ./my-reports
 */

import { createDashboardServer } from '../lib/dashboard/index.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
Parity - Dashboard Server

Usage:
  npx tsx src/cli/dashboard.ts [options]

Options:
  --port      Server port (default: 3847)
  --reports   Reports directory (default: ./.parity-reports)
  --host      Host to bind (default: localhost)

Example:
  npx tsx src/cli/dashboard.ts --port 8080
`);
    process.exit(0);
  }

  const port = args.includes('--port')
    ? parseInt(args[args.indexOf('--port') + 1])
    : 3847;
  
  const reportsDir = args.includes('--reports')
    ? args[args.indexOf('--reports') + 1]
    : './.parity-reports';
  
  const host = args.includes('--host')
    ? args[args.indexOf('--host') + 1]
    : 'localhost';

  console.log('🎯 Starting Parity Dashboard...\n');
  console.log(`  Port: ${port}`);
  console.log(`  Reports: ${reportsDir}`);
  console.log(`  Host: ${host}\n`);

  const server = createDashboardServer({ port, reportsDir, host });
  
  await server.start();

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    await server.stop();
    process.exit(0);
  });
}

main().catch(console.error);
