/**
 * Baseline Manager
 * 
 * Feature #10: Baseline management
 * 
 * Track Figma design versions over time. Update baselines when
 * designs intentionally change.
 */

import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join, basename } from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface BaselineEntry {
  /** Unique identifier */
  id: string;
  /** Page/frame name */
  name: string;
  /** Figma frame path */
  framePath: string;
  /** Content hash of the image */
  contentHash: string;
  /** Local file path */
  imagePath: string;
  /** Figma file key */
  figmaFile: string;
  /** Figma node ID */
  nodeId: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Version number */
  version: number;
  /** Viewport dimensions */
  viewport: {
    width: number;
    height: number;
  };
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface BaselineManifest {
  version: string;
  figmaFile: string;
  createdAt: string;
  updatedAt: string;
  entries: BaselineEntry[];
}

export interface BaselineDiff {
  added: BaselineEntry[];
  removed: BaselineEntry[];
  changed: Array<{
    old: BaselineEntry;
    new: BaselineEntry;
  }>;
  unchanged: BaselineEntry[];
}

// ============================================================================
// Baseline Manager
// ============================================================================

export class BaselineManager {
  private baselineDir: string;
  private manifest: BaselineManifest | null = null;

  constructor(baselineDir: string = './.parity-baselines') {
    this.baselineDir = baselineDir;
  }

  /**
   * Initialize baseline directory and manifest
   */
  async init(): Promise<void> {
    await mkdir(this.baselineDir, { recursive: true });
    await mkdir(join(this.baselineDir, 'images'), { recursive: true });
    
    try {
      await this.loadManifest();
    } catch {
      // Create new manifest
      this.manifest = {
        version: '1.0',
        figmaFile: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entries: [],
      };
      await this.saveManifest();
    }
  }

  /**
   * Load manifest from disk
   */
  async loadManifest(): Promise<BaselineManifest> {
    const path = join(this.baselineDir, 'manifest.json');
    const content = await readFile(path, 'utf-8');
    this.manifest = JSON.parse(content);
    return this.manifest!;
  }

  /**
   * Save manifest to disk
   */
  async saveManifest(): Promise<void> {
    if (!this.manifest) return;
    
    this.manifest.updatedAt = new Date().toISOString();
    const path = join(this.baselineDir, 'manifest.json');
    await writeFile(path, JSON.stringify(this.manifest, null, 2));
  }

  /**
   * Get current manifest
   */
  getManifest(): BaselineManifest | null {
    return this.manifest;
  }

  /**
   * Add or update a baseline entry
   */
  async set(
    name: string,
    imageBuffer: Buffer,
    options: {
      framePath: string;
      figmaFile: string;
      nodeId: string;
      viewport: { width: number; height: number };
      metadata?: Record<string, unknown>;
    }
  ): Promise<BaselineEntry> {
    if (!this.manifest) await this.init();

    const contentHash = this.hashContent(imageBuffer);
    const existing = this.manifest!.entries.find(e => e.name === name);

    // Check if content actually changed
    if (existing && existing.contentHash === contentHash) {
      console.log(`[Baseline] "${name}" unchanged (hash match)`);
      return existing;
    }

    // Save image
    const imageFilename = `${this.slugify(name)}_${contentHash.slice(0, 8)}.png`;
    const imagePath = join(this.baselineDir, 'images', imageFilename);
    await writeFile(imagePath, imageBuffer);

    // Create entry
    const entry: BaselineEntry = {
      id: existing?.id || this.generateId(),
      name,
      framePath: options.framePath,
      contentHash,
      imagePath,
      figmaFile: options.figmaFile,
      nodeId: options.nodeId,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: (existing?.version || 0) + 1,
      viewport: options.viewport,
      metadata: options.metadata,
    };

    // Update manifest
    if (existing) {
      const index = this.manifest!.entries.indexOf(existing);
      this.manifest!.entries[index] = entry;
      
      // Clean up old image if different
      if (existing.imagePath !== entry.imagePath) {
        try {
          await unlink(existing.imagePath);
        } catch {}
      }
      
      console.log(`[Baseline] Updated "${name}" (v${entry.version})`);
    } else {
      this.manifest!.entries.push(entry);
      console.log(`[Baseline] Added "${name}"`);
    }

    this.manifest!.figmaFile = options.figmaFile;
    await this.saveManifest();

    return entry;
  }

  /**
   * Get a baseline entry by name
   */
  get(name: string): BaselineEntry | undefined {
    return this.manifest?.entries.find(e => e.name === name);
  }

  /**
   * Get all baseline entries
   */
  list(): BaselineEntry[] {
    return this.manifest?.entries || [];
  }

  /**
   * Remove a baseline entry
   */
  async remove(name: string): Promise<boolean> {
    if (!this.manifest) return false;

    const index = this.manifest.entries.findIndex(e => e.name === name);
    if (index === -1) return false;

    const entry = this.manifest.entries[index];
    
    // Remove image file
    try {
      await unlink(entry.imagePath);
    } catch {}

    // Remove from manifest
    this.manifest.entries.splice(index, 1);
    await this.saveManifest();

    console.log(`[Baseline] Removed "${name}"`);
    return true;
  }

  /**
   * Clear all baselines
   */
  async clear(): Promise<void> {
    if (!this.manifest) return;

    // Remove all image files
    for (const entry of this.manifest.entries) {
      try {
        await unlink(entry.imagePath);
      } catch {}
    }

    this.manifest.entries = [];
    await this.saveManifest();
    
    console.log('[Baseline] Cleared all entries');
  }

  /**
   * Compare current baselines with new Figma exports
   */
  diff(
    newEntries: Array<{
      name: string;
      contentHash: string;
      framePath: string;
    }>
  ): BaselineDiff {
    const result: BaselineDiff = {
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
    };

    const existingNames = new Set(this.manifest?.entries.map(e => e.name) || []);
    const newNames = new Set(newEntries.map(e => e.name));

    // Find added
    for (const entry of newEntries) {
      if (!existingNames.has(entry.name)) {
        result.added.push(entry as any);
      }
    }

    // Find removed and changed
    for (const existing of this.manifest?.entries || []) {
      if (!newNames.has(existing.name)) {
        result.removed.push(existing);
      } else {
        const newEntry = newEntries.find(e => e.name === existing.name);
        if (newEntry && newEntry.contentHash !== existing.contentHash) {
          result.changed.push({ old: existing, new: newEntry as any });
        } else {
          result.unchanged.push(existing);
        }
      }
    }

    return result;
  }

  /**
   * Get baseline image as buffer
   */
  async getImage(name: string): Promise<Buffer | null> {
    const entry = this.get(name);
    if (!entry) return null;

    try {
      return await readFile(entry.imagePath);
    } catch {
      return null;
    }
  }

  /**
   * Get version history for an entry
   */
  getHistory(name: string): { version: number; createdAt: string; updatedAt: string }[] {
    const entry = this.get(name);
    if (!entry) return [];

    // In a full implementation, we'd store version history
    // For now, just return current version
    return [{
      version: entry.version,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }];
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private hashContent(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private generateId(): string {
    return createHash('sha256')
      .update(Date.now().toString() + Math.random().toString())
      .digest('hex')
      .slice(0, 12);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBaselineManager(baselineDir?: string): BaselineManager {
  return new BaselineManager(baselineDir);
}
