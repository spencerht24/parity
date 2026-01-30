/**
 * PR Comment Generator Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRCommentGenerator, createPRCommentGenerator, type PageResult } from '../src/lib/github/index.js';
import type { ComparisonResult } from '../src/lib/comparison/index.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockResult: ComparisonResult = {
  matchScore: 87,
  timestamp: new Date().toISOString(),
  figmaImage: '/path/to/figma.png',
  liveImage: '/path/to/live.png',
  differences: [
    {
      type: 'typography',
      severity: 'high',
      element: 'h1.hero',
      description: 'Font size differs by 6px',
      figmaValue: '48px',
      liveValue: '42px',
      suggestion: 'Update font-size in CSS',
    },
    {
      type: 'color',
      severity: 'medium',
      description: 'Button color slightly different',
    },
  ],
  annotations: ['Overall good match'],
  processingTime: 2500,
  model: 'gpt-4o',
};

const mockPages: PageResult[] = [
  {
    name: 'Homepage',
    url: '/',
    result: mockResult,
  },
  {
    name: 'About',
    url: '/about',
    result: { ...mockResult, matchScore: 95, differences: [] },
  },
];

describe('PRCommentGenerator', () => {
  let generator: PRCommentGenerator;

  beforeEach(() => {
    mockFetch.mockReset();
    generator = createPRCommentGenerator({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
    });
  });

  describe('generateComment', () => {
    it('should generate valid markdown', () => {
      const markdown = generator.generateComment(mockPages, true, 91);

      expect(markdown).toContain('## ✅ Parity UX Fidelity Check');
      expect(markdown).toContain('91%');
      expect(markdown).toContain('Homepage');
      expect(markdown).toContain('About');
    });

    it('should include failure status when not passed', () => {
      const markdown = generator.generateComment(mockPages, false, 75);

      expect(markdown).toContain('## ❌ Parity UX Fidelity Check');
      expect(markdown).toContain('Failed');
    });

    it('should include issue breakdown', () => {
      const markdown = generator.generateComment(mockPages, true, 91);

      expect(markdown).toContain('Issue Breakdown');
      expect(markdown).toContain('Critical');
      expect(markdown).toContain('High');
      expect(markdown).toContain('Medium');
    });

    it('should include collapsible page details', () => {
      const markdown = generator.generateComment(mockPages, true, 91);

      expect(markdown).toContain('<details>');
      expect(markdown).toContain('<summary>');
      expect(markdown).toContain('87%');
      expect(markdown).toContain('95%');
    });

    it('should include differences with suggestions', () => {
      const markdown = generator.generateComment(mockPages, true, 91);

      expect(markdown).toContain('Font size differs by 6px');
      expect(markdown).toContain('`h1.hero`');
      expect(markdown).toContain('Update font-size in CSS');
    });

    it('should include report link when provided', () => {
      const markdown = generator.generateComment(
        mockPages,
        true,
        91,
        'https://example.com/report.html'
      );

      expect(markdown).toContain('[View Full Report]');
      expect(markdown).toContain('https://example.com/report.html');
    });

    it('should include Parity marker for updates', () => {
      const markdown = generator.generateComment(mockPages, true, 91);

      expect(markdown).toContain('<!-- parity-ux-check -->');
    });
  });

  describe('postComment', () => {
    it('should create new comment when none exists', async () => {
      // Mock: no existing comments
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      
      // Mock: create comment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 456,
          html_url: 'https://github.com/test-owner/test-repo/pull/123#issuecomment-456',
        }),
      });

      const result = await generator.postComment('Test comment');

      expect(result.success).toBe(true);
      expect(result.commentId).toBe(456);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update existing comment', async () => {
      // Mock: existing comment found
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 789, body: '<!-- parity-ux-check --> Old comment' },
        ],
      });
      
      // Mock: update comment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 789,
          html_url: 'https://github.com/test-owner/test-repo/pull/123#issuecomment-789',
        }),
      });

      const result = await generator.postComment('Updated comment');

      expect(result.success).toBe(true);
      expect(result.commentId).toBe(789);
      
      // Should call PATCH, not POST
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/issues/comments/789'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const result = await generator.postComment('Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });
  });

  describe('factory', () => {
    it('should create generator with config', () => {
      const gen = createPRCommentGenerator({
        token: 'token',
        owner: 'owner',
        repo: 'repo',
        prNumber: 1,
      });

      expect(gen).toBeInstanceOf(PRCommentGenerator);
    });
  });
});
