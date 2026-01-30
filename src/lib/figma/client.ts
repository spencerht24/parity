/**
 * Figma API Client
 * 
 * Handles all Figma API interactions with rate limiting and caching.
 * 
 * Rate Limits (per minute):
 * - Tier 1 (Image export): 20/min per Full seat
 * - Tier 2 (File metadata): 100/min
 * - Tier 3 (Comments, versions): 150/min
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Types & Schemas
// ============================================================================

const FigmaNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  children: z.array(z.lazy(() => FigmaNodeSchema)).optional(),
  absoluteBoundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  absoluteRenderBounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional().nullable(),
  backgroundColor: z.object({
    r: z.number(),
    g: z.number(),
    b: z.number(),
    a: z.number(),
  }).optional(),
  fills: z.array(z.any()).optional(),
  strokes: z.array(z.any()).optional(),
  effects: z.array(z.any()).optional(),
  style: z.record(z.any()).optional(),
});

type FigmaNode = z.infer<typeof FigmaNodeSchema>;

const FigmaFileSchema = z.object({
  name: z.string(),
  lastModified: z.string(),
  version: z.string(),
  document: FigmaNodeSchema,
  components: z.record(z.any()).optional(),
  styles: z.record(z.any()).optional(),
});

type FigmaFile = z.infer<typeof FigmaFileSchema>;

const FigmaImageResponseSchema = z.object({
  err: z.string().nullable(),
  images: z.record(z.string()),
});

export interface FigmaClientConfig {
  token: string;
  cacheDir?: string;
  rateLimitDelay?: number; // ms between requests
}

export interface ExportedFrame {
  nodeId: string;
  name: string;
  path: string; // Full path like "Page 1 / Hero Section"
  imageUrl: string;
  localPath?: string;
  width: number;
  height: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DesignTokens {
  colors: Array<{
    name: string;
    value: string; // hex
    rgba: { r: number; g: number; b: number; a: number };
  }>;
  typography: Array<{
    name: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight?: number;
    letterSpacing?: number;
  }>;
}

// ============================================================================
// Rate Limiter
// ============================================================================

class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minDelay: number;

  constructor(requestsPerMinute: number) {
    this.minDelay = Math.ceil(60000 / requestsPerMinute);
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      
      if (elapsed < this.minDelay) {
        await this.sleep(this.minDelay - elapsed);
      }

      const task = this.queue.shift();
      if (task) {
        this.lastRequestTime = Date.now();
        await task();
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Figma Client
// ============================================================================

export class FigmaClient {
  private token: string;
  private cacheDir: string;
  private baseUrl = 'https://api.figma.com/v1';
  
  // Rate limiters for different tiers
  private tier1Limiter = new RateLimiter(20);  // Image exports
  private tier2Limiter = new RateLimiter(100); // File metadata

  constructor(config: FigmaClientConfig) {
    this.token = config.token;
    this.cacheDir = config.cacheDir || './.parity-cache/figma';
  }

  // --------------------------------------------------------------------------
  // Core API Methods
  // --------------------------------------------------------------------------

  private async request<T>(
    endpoint: string,
    limiter: RateLimiter
  ): Promise<T> {
    return limiter.schedule(async () => {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'X-Figma-Token': this.token,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Figma API error (${response.status}): ${text}`);
      }

      return response.json() as Promise<T>;
    });
  }

  /**
   * Get file metadata and structure
   */
  async getFile(fileKey: string): Promise<FigmaFile> {
    const data = await this.request<unknown>(
      `/files/${fileKey}`,
      this.tier2Limiter
    );
    return FigmaFileSchema.parse(data);
  }

  /**
   * Get specific nodes from a file
   */
  async getNodes(
    fileKey: string,
    nodeIds: string[]
  ): Promise<Record<string, FigmaNode>> {
    const ids = nodeIds.join(',');
    const data = await this.request<{ nodes: Record<string, { document: FigmaNode }> }>(
      `/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`,
      this.tier2Limiter
    );
    
    const result: Record<string, FigmaNode> = {};
    for (const [id, node] of Object.entries(data.nodes)) {
      result[id] = node.document;
    }
    return result;
  }

  /**
   * Export nodes as images
   */
  async exportImages(
    fileKey: string,
    nodeIds: string[],
    options: {
      format?: 'png' | 'svg' | 'pdf' | 'jpg';
      scale?: number;
    } = {}
  ): Promise<Record<string, string>> {
    const { format = 'png', scale = 2 } = options;
    const ids = nodeIds.join(',');
    
    const data = await this.request<unknown>(
      `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
      this.tier1Limiter
    );
    
    const parsed = FigmaImageResponseSchema.parse(data);
    if (parsed.err) {
      throw new Error(`Figma image export error: ${parsed.err}`);
    }
    
    return parsed.images;
  }

  // --------------------------------------------------------------------------
  // High-Level Methods
  // --------------------------------------------------------------------------

  /**
   * Find all frames in a file
   */
  findFrames(node: FigmaNode, path: string[] = []): ExportedFrame[] {
    const frames: ExportedFrame[] = [];
    const currentPath = [...path, node.name];

    // Collect FRAME and COMPONENT types (main exportable elements)
    if (
      (node.type === 'FRAME' || node.type === 'COMPONENT') &&
      node.absoluteBoundingBox
    ) {
      frames.push({
        nodeId: node.id,
        name: node.name,
        path: currentPath.join(' / '),
        imageUrl: '', // Will be populated by exportImages
        width: node.absoluteBoundingBox.width,
        height: node.absoluteBoundingBox.height,
        boundingBox: node.absoluteBoundingBox,
      });
    }

    // Recursively search children
    if (node.children) {
      for (const child of node.children) {
        frames.push(...this.findFrames(child, currentPath));
      }
    }

    return frames;
  }

  /**
   * Export all frames from a file with caching
   */
  async exportAllFrames(
    fileKey: string,
    options: {
      maxFrames?: number;
      downloadImages?: boolean;
    } = {}
  ): Promise<ExportedFrame[]> {
    const { maxFrames = 100, downloadImages = true } = options;

    console.log(`[Figma] Fetching file structure for ${fileKey}...`);
    const file = await this.getFile(fileKey);
    
    console.log(`[Figma] Finding frames...`);
    let frames = this.findFrames(file.document);
    
    if (frames.length > maxFrames) {
      console.warn(`[Figma] Found ${frames.length} frames, limiting to ${maxFrames}`);
      frames = frames.slice(0, maxFrames);
    }

    console.log(`[Figma] Found ${frames.length} frames, exporting images...`);
    
    // Batch node IDs (max 500 per request per Figma docs)
    const batchSize = 100;
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const nodeIds = batch.map(f => f.nodeId);
      
      const images = await this.exportImages(fileKey, nodeIds);
      
      for (const frame of batch) {
        frame.imageUrl = images[frame.nodeId] || '';
      }
    }

    // Download and cache images
    if (downloadImages) {
      await this.ensureCacheDir();
      
      for (const frame of frames) {
        if (frame.imageUrl) {
          const localPath = await this.downloadAndCacheImage(
            frame.imageUrl,
            frame.nodeId
          );
          frame.localPath = localPath;
        }
      }
    }

    console.log(`[Figma] Export complete: ${frames.length} frames`);
    return frames;
  }

  /**
   * Extract design tokens from a file
   */
  async extractDesignTokens(fileKey: string): Promise<DesignTokens> {
    const file = await this.getFile(fileKey);
    
    const tokens: DesignTokens = {
      colors: [],
      typography: [],
    };

    // Extract color styles
    if (file.styles) {
      for (const [id, style] of Object.entries(file.styles)) {
        if ((style as any).styleType === 'FILL') {
          // Would need to get the actual fill values from nodes using this style
          // This is a simplified version
          tokens.colors.push({
            name: (style as any).name || id,
            value: '#000000', // Placeholder - real impl needs node data
            rgba: { r: 0, g: 0, b: 0, a: 1 },
          });
        } else if ((style as any).styleType === 'TEXT') {
          tokens.typography.push({
            name: (style as any).name || id,
            fontFamily: 'Unknown', // Placeholder
            fontSize: 16,
            fontWeight: 400,
          });
        }
      }
    }

    return tokens;
  }

  // --------------------------------------------------------------------------
  // Caching
  // --------------------------------------------------------------------------

  private async ensureCacheDir(): Promise<void> {
    try {
      await access(this.cacheDir);
    } catch {
      await mkdir(this.cacheDir, { recursive: true });
    }
  }

  private contentHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private async downloadAndCacheImage(
    url: string,
    nodeId: string
  ): Promise<string> {
    // Check cache first
    const cacheKey = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const cachePath = join(this.cacheDir, `${cacheKey}.png`);

    try {
      await access(cachePath);
      console.log(`[Figma] Using cached image for ${nodeId}`);
      return cachePath;
    } catch {
      // Not cached, download
    }

    console.log(`[Figma] Downloading image for ${nodeId}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(cachePath, buffer);
    
    return cachePath;
  }

  /**
   * Clear the cache
   */
  async clearCache(): Promise<void> {
    const { rm } = await import('fs/promises');
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
      console.log('[Figma] Cache cleared');
    } catch {
      // Cache dir might not exist
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createFigmaClient(config: FigmaClientConfig): FigmaClient {
  return new FigmaClient(config);
}
