/**
 * Dashboard Server Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DashboardServer, createDashboardServer } from '../src/lib/dashboard/index.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_PORT = 3999;
const TEST_REPORTS_DIR = './test-dashboard-reports';

describe('DashboardServer', () => {
  let server: DashboardServer;

  beforeAll(async () => {
    // Create test reports directory with sample files
    await mkdir(TEST_REPORTS_DIR, { recursive: true });
    
    await writeFile(
      join(TEST_REPORTS_DIR, 'test-report.html'),
      '<html><body>Test Report</body></html>'
    );
    
    await writeFile(
      join(TEST_REPORTS_DIR, 'test-data.json'),
      JSON.stringify({ matchScore: 95 })
    );

    server = createDashboardServer({
      port: TEST_PORT,
      reportsDir: TEST_REPORTS_DIR,
    });
    
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    await rm(TEST_REPORTS_DIR, { recursive: true, force: true });
  });

  describe('dashboard page', () => {
    it('should serve dashboard at root', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/`);
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Parity Dashboard');
      expect(html).toContain('test-report.html');
      expect(html).toContain('test-data.json');
    });
  });

  describe('API', () => {
    it('should list reports at /api/reports', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/api/reports`);
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('application/json');
      
      const reports = await response.json();
      expect(Array.isArray(reports)).toBe(true);
      expect(reports.length).toBe(2);
      
      const htmlReport = reports.find((r: any) => r.type === 'html');
      expect(htmlReport).toBeDefined();
      expect(htmlReport.name).toBe('test-report.html');
      expect(htmlReport.path).toBe('/reports/test-report.html');
    });
  });

  describe('report serving', () => {
    it('should serve HTML reports', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/reports/test-report.html`);
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('Test Report');
    });

    it('should serve JSON reports', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/reports/test-data.json`);
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('application/json');
      
      const data = await response.json();
      expect(data.matchScore).toBe(95);
    });

    it('should return 404 for missing reports', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/reports/nonexistent.html`);
      
      expect(response.status).toBe(404);
    });
  });

  describe('factory', () => {
    it('should create server with default config', () => {
      const defaultServer = createDashboardServer();
      expect(defaultServer).toBeInstanceOf(DashboardServer);
    });
  });
});
