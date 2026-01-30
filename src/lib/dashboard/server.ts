/**
 * Dashboard Server
 * 
 * Feature #5: Basic web dashboard
 * 
 * Simple server to view and manage Parity reports.
 * Serves HTML reports and provides a listing interface.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { parse } from 'url';

// ============================================================================
// Types
// ============================================================================

export interface DashboardConfig {
  port?: number;
  reportsDir?: string;
  host?: string;
}

export interface ReportInfo {
  name: string;
  path: string;
  type: 'json' | 'html';
  size: number;
  created: string;
}

// ============================================================================
// MIME Types
// ============================================================================

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// ============================================================================
// Dashboard Server
// ============================================================================

export class DashboardServer {
  private port: number;
  private host: string;
  private reportsDir: string;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(config: DashboardConfig = {}) {
    this.port = config.port || 3847;
    this.host = config.host || 'localhost';
    this.reportsDir = config.reportsDir || './.parity-reports';
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    
    return new Promise((resolve) => {
      this.server!.listen(this.port, this.host, () => {
        console.log(`\n📊 Parity Dashboard running at http://${this.host}:${this.port}\n`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Request Handling
  // --------------------------------------------------------------------------

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = parse(req.url || '/', true);
    const pathname = url.pathname || '/';

    try {
      // API routes
      if (pathname === '/api/reports') {
        await this.handleListReports(res);
        return;
      }

      // Serve report files
      if (pathname.startsWith('/reports/')) {
        const filename = pathname.slice(9);
        await this.serveReport(filename, res);
        return;
      }

      // Dashboard home
      if (pathname === '/' || pathname === '/index.html') {
        await this.serveDashboard(res);
        return;
      }

      // 404
      this.send404(res);
    } catch (error) {
      this.sendError(res, error);
    }
  }

  private async handleListReports(res: ServerResponse): Promise<void> {
    const reports = await this.getReports();
    
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(reports, null, 2));
  }

  private async serveReport(filename: string, res: ServerResponse): Promise<void> {
    const filepath = join(this.reportsDir, filename);
    const ext = extname(filename);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const content = await readFile(filepath);
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch {
      this.send404(res);
    }
  }

  private async serveDashboard(res: ServerResponse): Promise<void> {
    const reports = await this.getReports();
    const html = this.generateDashboardHtml(reports);
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  // --------------------------------------------------------------------------
  // Report Discovery
  // --------------------------------------------------------------------------

  private async getReports(): Promise<ReportInfo[]> {
    const reports: ReportInfo[] = [];

    try {
      const files = await readdir(this.reportsDir);
      
      for (const file of files) {
        const ext = extname(file);
        if (ext === '.html' || ext === '.json') {
          const filepath = join(this.reportsDir, file);
          const stats = await stat(filepath);
          
          reports.push({
            name: file,
            path: `/reports/${file}`,
            type: ext.slice(1) as 'json' | 'html',
            size: stats.size,
            created: stats.birthtime.toISOString(),
          });
        }
      }
    } catch {
      // Reports directory doesn't exist yet
    }

    // Sort by creation date, newest first
    reports.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    
    return reports;
  }

  // --------------------------------------------------------------------------
  // Dashboard HTML
  // --------------------------------------------------------------------------

  private generateDashboardHtml(reports: ReportInfo[]): string {
    const htmlReports = reports.filter(r => r.type === 'html');
    const jsonReports = reports.filter(r => r.type === 'json');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parity Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
    }
    .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 40px; }
    h1 { font-size: 36px; margin-bottom: 10px; }
    .subtitle { opacity: 0.7; font-size: 18px; }
    .logo { font-size: 48px; margin-bottom: 15px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
    .stat { background: rgba(255,255,255,0.1); padding: 25px; border-radius: 12px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: bold; }
    .stat-label { opacity: 0.7; font-size: 14px; margin-top: 5px; }
    .section { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 25px; margin-bottom: 20px; }
    .section h2 { font-size: 20px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .report-list { list-style: none; }
    .report-item { 
      display: flex; 
      align-items: center; 
      padding: 15px; 
      background: rgba(255,255,255,0.05); 
      border-radius: 8px; 
      margin-bottom: 10px;
      transition: all 0.2s;
    }
    .report-item:hover { background: rgba(255,255,255,0.1); transform: translateX(5px); }
    .report-item a { color: #fff; text-decoration: none; flex: 1; }
    .report-icon { margin-right: 15px; font-size: 24px; }
    .report-name { font-weight: 500; margin-bottom: 3px; }
    .report-meta { font-size: 12px; opacity: 0.6; }
    .report-size { background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 4px; font-size: 12px; }
    .empty { text-align: center; padding: 40px; opacity: 0.6; }
    .actions { margin-top: 30px; text-align: center; }
    .btn { 
      display: inline-block; 
      padding: 12px 25px; 
      background: #6366f1; 
      color: white; 
      text-decoration: none; 
      border-radius: 8px;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn:hover { background: #4f46e5; }
    footer { text-align: center; margin-top: 40px; opacity: 0.5; font-size: 13px; }
    footer a { color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">🎯</div>
      <h1>Parity Dashboard</h1>
      <p class="subtitle">AI-powered UX Fidelity Testing</p>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${htmlReports.length}</div>
        <div class="stat-label">HTML Reports</div>
      </div>
      <div class="stat">
        <div class="stat-value">${jsonReports.length}</div>
        <div class="stat-label">JSON Reports</div>
      </div>
      <div class="stat">
        <div class="stat-value">${reports.length}</div>
        <div class="stat-label">Total Files</div>
      </div>
    </div>

    <div class="section">
      <h2>📊 Visual Reports</h2>
      ${htmlReports.length > 0 ? `
        <ul class="report-list">
          ${htmlReports.map(r => `
            <li class="report-item">
              <span class="report-icon">📄</span>
              <a href="${r.path}" target="_blank">
                <div class="report-name">${r.name}</div>
                <div class="report-meta">${new Date(r.created).toLocaleString()}</div>
              </a>
              <span class="report-size">${this.formatSize(r.size)}</span>
            </li>
          `).join('')}
        </ul>
      ` : '<div class="empty">No reports yet. Run a comparison to generate reports.</div>'}
    </div>

    <div class="section">
      <h2>📋 JSON Data</h2>
      ${jsonReports.length > 0 ? `
        <ul class="report-list">
          ${jsonReports.map(r => `
            <li class="report-item">
              <span class="report-icon">{ }</span>
              <a href="${r.path}" target="_blank">
                <div class="report-name">${r.name}</div>
                <div class="report-meta">${new Date(r.created).toLocaleString()}</div>
              </a>
              <span class="report-size">${this.formatSize(r.size)}</span>
            </li>
          `).join('')}
        </ul>
      ` : '<div class="empty">No JSON reports available.</div>'}
    </div>

    <div class="actions">
      <a href="/api/reports" class="btn" target="_blank">View API Response</a>
    </div>

    <footer>
      <p>Parity v0.1.0 | <a href="https://github.com/spencerht24/parity" target="_blank">GitHub</a></p>
    </footer>
  </div>

  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>`;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  private send404(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private sendError(res: ServerResponse, error: unknown): void {
    console.error('[Dashboard] Error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

// ============================================================================
// Factory & CLI
// ============================================================================

export function createDashboardServer(config?: DashboardConfig): DashboardServer {
  return new DashboardServer(config);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createDashboardServer({
    port: parseInt(process.env.PORT || '3847'),
    reportsDir: process.env.REPORTS_DIR || './.parity-reports',
  });
  
  server.start().catch(console.error);
}
