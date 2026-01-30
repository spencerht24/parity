/**
 * GitHub Integration Module
 * 
 * Feature #7: PR comments with visual diffs
 * 
 * Provides:
 * - PR comment generation with visual diff summaries
 * - Automatic comment updates on re-runs
 * - Collapsible per-page details
 */

export {
  PRCommentGenerator,
  createPRCommentGenerator,
  type CommentConfig,
  type PageResult,
  type CommentResult,
} from './pr-comment.js';
