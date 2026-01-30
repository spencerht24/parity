/**
 * Figma Client Tests
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FigmaClient, createFigmaClient, type ExportedFrame } from '../src/lib/figma/index.js';

// Mock fetch for testing without real API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('FigmaClient', () => {
  let client: FigmaClient;

  beforeAll(() => {
    client = createFigmaClient({
      token: 'test-token',
      cacheDir: './test-cache',
    });
  });

  describe('findFrames', () => {
    it('should find frames in a node tree', () => {
      const mockDocument = {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [
          {
            id: '1:1',
            name: 'Page 1',
            type: 'CANVAS',
            children: [
              {
                id: '2:1',
                name: 'Hero Section',
                type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 800 },
              },
              {
                id: '2:2',
                name: 'Footer',
                type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 800, width: 1440, height: 200 },
              },
            ],
          },
        ],
      };

      const frames = client.findFrames(mockDocument);

      expect(frames).toHaveLength(2);
      expect(frames[0].name).toBe('Hero Section');
      expect(frames[0].path).toBe('Document / Page 1 / Hero Section');
      expect(frames[0].width).toBe(1440);
      expect(frames[0].height).toBe(800);
      expect(frames[1].name).toBe('Footer');
    });

    it('should find nested frames', () => {
      const mockDocument = {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [
          {
            id: '1:1',
            name: 'Page 1',
            type: 'CANVAS',
            children: [
              {
                id: '2:1',
                name: 'Parent Frame',
                type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 800 },
                children: [
                  {
                    id: '3:1',
                    name: 'Child Frame',
                    type: 'FRAME',
                    absoluteBoundingBox: { x: 10, y: 10, width: 200, height: 100 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const frames = client.findFrames(mockDocument);

      expect(frames).toHaveLength(2);
      expect(frames[0].path).toBe('Document / Page 1 / Parent Frame');
      expect(frames[1].path).toBe('Document / Page 1 / Parent Frame / Child Frame');
    });

    it('should find COMPONENT nodes', () => {
      const mockDocument = {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [
          {
            id: '1:1',
            name: 'Page 1',
            type: 'CANVAS',
            children: [
              {
                id: '2:1',
                name: 'Button',
                type: 'COMPONENT',
                absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 48 },
              },
            ],
          },
        ],
      };

      const frames = client.findFrames(mockDocument);

      expect(frames).toHaveLength(1);
      expect(frames[0].name).toBe('Button');
      expect(frames[0].nodeId).toBe('2:1');
    });

    it('should skip nodes without bounding box', () => {
      const mockDocument = {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: [
          {
            id: '1:1',
            name: 'Frame without bounds',
            type: 'FRAME',
            // No absoluteBoundingBox
          },
        ],
      };

      const frames = client.findFrames(mockDocument);

      expect(frames).toHaveLength(0);
    });
  });

  describe('API integration', () => {
    it('should fetch file structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Test File',
          lastModified: '2024-01-01T00:00:00Z',
          version: '1',
          document: {
            id: '0:0',
            name: 'Document',
            type: 'DOCUMENT',
            children: [],
          },
        }),
      });

      const file = await client.getFile('test-file-key');

      expect(file.name).toBe('Test File');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.figma.com/v1/files/test-file-key',
        expect.objectContaining({
          headers: { 'X-Figma-Token': 'test-token' },
        })
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(client.getFile('invalid-key')).rejects.toThrow(
        'Figma API error (403): Forbidden'
      );
    });

    it('should export images', async () => {
      // Clear previous mocks
      mockFetch.mockReset();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          err: null,
          images: {
            '1:1': 'https://figma-images.com/1-1.png',
            '1:2': 'https://figma-images.com/1-2.png',
          },
        }),
      });

      // Create fresh client for this test
      const testClient = createFigmaClient({
        token: 'test-token',
        cacheDir: './test-cache',
      });

      const images = await testClient.exportImages('test-file', ['1:1', '1:2']);

      expect(images['1:1']).toBe('https://figma-images.com/1-1.png');
      expect(images['1:2']).toBe('https://figma-images.com/1-2.png');
    });
  });
});

describe('Rate Limiting', () => {
  it('should space out requests', async () => {
    const client = createFigmaClient({
      token: 'test-token',
    });

    // Mock multiple API calls
    const times: number[] = [];
    mockFetch.mockImplementation(async () => {
      times.push(Date.now());
      return {
        ok: true,
        json: async () => ({
          name: 'Test',
          lastModified: '2024-01-01T00:00:00Z',
          version: '1',
          document: { id: '0:0', name: 'Doc', type: 'DOCUMENT', children: [] },
        }),
      };
    });

    // Make 3 rapid requests
    await Promise.all([
      client.getFile('key1'),
      client.getFile('key2'),
      client.getFile('key3'),
    ]);

    // Check that requests were spaced out (at least 500ms apart for 100/min limit)
    expect(times.length).toBe(3);
    if (times.length >= 2) {
      const gap = times[1] - times[0];
      expect(gap).toBeGreaterThanOrEqual(500); // 60000ms / 100 requests = 600ms min
    }
  });
});
