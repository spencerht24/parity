/**
 * AI Comparison Engine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ComparisonEngine,
  createComparisonEngine,
  type VisualDifference,
  type ComparisonResult,
} from '../src/lib/comparison/index.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');

describe('ComparisonEngine', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('summarizeDifferences', () => {
    it('should count differences by severity', () => {
      const differences: VisualDifference[] = [
        { type: 'typography', severity: 'critical', description: 'Wrong font' },
        { type: 'color', severity: 'high', description: 'Color mismatch' },
        { type: 'spacing', severity: 'medium', description: 'Padding off' },
        { type: 'spacing', severity: 'medium', description: 'Margin off' },
        { type: 'layout', severity: 'low', description: 'Minor alignment' },
      ];

      const counts = ComparisonEngine.summarizeDifferences(differences);

      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(2);
      expect(counts.low).toBe(1);
    });

    it('should return zeros for empty array', () => {
      const counts = ComparisonEngine.summarizeDifferences([]);

      expect(counts.critical).toBe(0);
      expect(counts.high).toBe(0);
      expect(counts.medium).toBe(0);
      expect(counts.low).toBe(0);
    });
  });

  describe('passesThresholds', () => {
    const baseResult: ComparisonResult = {
      matchScore: 85,
      timestamp: new Date().toISOString(),
      figmaImage: '/path/to/figma.png',
      liveImage: '/path/to/live.png',
      differences: [
        { type: 'typography', severity: 'high', description: 'Font size' },
        { type: 'color', severity: 'medium', description: 'Color shade' },
        { type: 'spacing', severity: 'low', description: 'Padding' },
      ],
      annotations: [],
      processingTime: 1000,
      model: 'gpt-4o',
    };

    it('should pass when all thresholds met', () => {
      const result = ComparisonEngine.passesThresholds(baseResult, {
        minScore: 80,
        maxCritical: 0,
        maxHigh: 5,
        maxMedium: 10,
      });

      expect(result.passes).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it('should fail when score below threshold', () => {
      const result = ComparisonEngine.passesThresholds(baseResult, {
        minScore: 90,
      });

      expect(result.passes).toBe(false);
      expect(result.reasons).toContain('Match score 85% below threshold 90%');
    });

    it('should fail when too many high severity issues', () => {
      const result = ComparisonEngine.passesThresholds(baseResult, {
        maxHigh: 0,
      });

      expect(result.passes).toBe(false);
      expect(result.reasons[0]).toContain('1 high severity issues');
    });

    it('should report multiple threshold failures', () => {
      const result = ComparisonEngine.passesThresholds(baseResult, {
        minScore: 95,
        maxHigh: 0,
      });

      expect(result.passes).toBe(false);
      expect(result.reasons).toHaveLength(2);
    });
  });

  describe('compare (mocked API)', () => {
    it('should call OpenAI API for GPT models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                matchScore: 92,
                differences: [
                  {
                    type: 'spacing',
                    severity: 'medium',
                    description: 'Button padding differs by 4px',
                  },
                ],
                annotations: ['Overall good match'],
              }),
            },
          }],
        }),
      });

      const engine = createComparisonEngine({ model: 'gpt-4o' });
      const result = await engine.compareBuffers(
        Buffer.from('fake-figma-image'),
        Buffer.from('fake-live-image')
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openai-key',
          }),
        })
      );

      expect(result.matchScore).toBe(92);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('spacing');
      expect(result.model).toBe('gpt-4o');
    });

    it('should call Anthropic API for Claude models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{
            text: JSON.stringify({
              matchScore: 88,
              differences: [],
              annotations: ['Perfect match'],
            }),
          }],
        }),
      });

      const engine = createComparisonEngine({ model: 'claude-sonnet' });
      const result = await engine.compareBuffers(
        Buffer.from('fake-figma'),
        Buffer.from('fake-live')
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
          }),
        })
      );

      expect(result.matchScore).toBe(88);
      expect(result.model).toBe('claude-sonnet');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Rate limit exceeded',
      });

      const engine = createComparisonEngine({ model: 'gpt-4o' });

      await expect(
        engine.compareBuffers(Buffer.from('a'), Buffer.from('b'))
      ).rejects.toThrow('OpenAI API error');
    });
  });

  describe('factory', () => {
    it('should create engine with default options', () => {
      const engine = createComparisonEngine();
      expect(engine).toBeInstanceOf(ComparisonEngine);
    });

    it('should create engine with custom options', () => {
      const engine = createComparisonEngine({
        model: 'claude-opus',
        sensitivity: 'strict',
        focus: ['typography', 'color'],
      });
      expect(engine).toBeInstanceOf(ComparisonEngine);
    });
  });
});
