/**
 * Dashboard Module
 * 
 * Feature #5: Basic web dashboard
 * 
 * Provides:
 * - Simple HTTP server for viewing reports
 * - Report listing API
 * - Auto-refreshing dashboard UI
 */

export {
  DashboardServer,
  createDashboardServer,
  type DashboardConfig,
  type ReportInfo,
} from './server.js';
