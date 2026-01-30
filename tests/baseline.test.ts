/**
 * Baseline Manager Tests
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  BaselineManager,
  createBaselineManager,
} from '../src/lib/baseline/index.js';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';

const TEST_BASELINE_DIR = './test-baselines';

describe('BaselineManager', () => {
  let manager: BaselineManager;

  beforeEach(async () => {
    // Clean up before each test
    try {
      await rm(TEST_BASELINE_DIR, { recursive: true, force: true });
    } catch {}
    
    manager = createBaselineManager(TEST_BASELINE_DIR);
    await manager.init();
  });

  afterAll(async () => {
    try {
      await rm(TEST_BASELINE_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('init', () => {
    it('should create baseline directory', async () => {
      const manifest = manager.getManifest();
      expect(manifest).toBeDefined();
      expect(manifest!.version).toBe('1.0');
      expect(manifest!.entries).toHaveLength(0);
    });
  });

  describe('set', () => {
    const testImage = Buffer.from('fake-image-data');
    const options = {
      framePath: 'Desktop/Home',
      figmaFile: 'file123',
      nodeId: 'node123',
      viewport: { width: 1440, height: 900 },
    };

    it('should add new baseline entry', async () => {
      const entry = await manager.set('Homepage', testImage, options);

      expect(entry.name).toBe('Homepage');
      expect(entry.framePath).toBe('Desktop/Home');
      expect(entry.version).toBe(1);
      expect(entry.contentHash).toBeDefined();
    });

    it('should update existing entry', async () => {
      await manager.set('Homepage', testImage, options);
      
      const newImage = Buffer.from('new-image-data');
      const entry = await manager.set('Homepage', newImage, options);

      expect(entry.version).toBe(2);
      expect(manager.list()).toHaveLength(1);
    });

    it('should not bump version if content unchanged', async () => {
      const entry1 = await manager.set('Homepage', testImage, options);
      const entry2 = await manager.set('Homepage', testImage, options);

      expect(entry2.version).toBe(entry1.version);
      expect(entry2.contentHash).toBe(entry1.contentHash);
    });

    it('should store metadata', async () => {
      const entry = await manager.set('Homepage', testImage, {
        ...options,
        metadata: { branch: 'main', author: 'test' },
      });

      expect(entry.metadata?.branch).toBe('main');
    });
  });

  describe('get', () => {
    it('should retrieve baseline by name', async () => {
      const testImage = Buffer.from('test');
      await manager.set('Test', testImage, {
        framePath: 'Test/Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 800, height: 600 },
      });

      const entry = manager.get('Test');
      expect(entry?.name).toBe('Test');
    });

    it('should return undefined for missing entry', () => {
      const entry = manager.get('NonExistent');
      expect(entry).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list all baselines', async () => {
      const img = Buffer.from('x');
      const opts = {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      };

      await manager.set('Page1', img, opts);
      await manager.set('Page2', img, opts);
      await manager.set('Page3', img, opts);

      expect(manager.list()).toHaveLength(3);
    });
  });

  describe('remove', () => {
    it('should remove baseline entry', async () => {
      await manager.set('ToRemove', Buffer.from('x'), {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      });

      const removed = await manager.remove('ToRemove');
      
      expect(removed).toBe(true);
      expect(manager.get('ToRemove')).toBeUndefined();
    });

    it('should return false for non-existent entry', async () => {
      const removed = await manager.remove('NonExistent');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      const img = Buffer.from('x');
      const opts = {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      };

      await manager.set('A', img, opts);
      await manager.set('B', img, opts);
      
      await manager.clear();

      expect(manager.list()).toHaveLength(0);
    });
  });

  describe('diff', () => {
    it('should detect added entries', async () => {
      await manager.set('Existing', Buffer.from('x'), {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      });

      const diff = manager.diff([
        { name: 'Existing', contentHash: 'abc', framePath: 'Frame' },
        { name: 'New', contentHash: 'def', framePath: 'Frame2' },
      ]);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].name).toBe('New');
    });

    it('should detect removed entries', async () => {
      await manager.set('WillBeRemoved', Buffer.from('x'), {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      });

      const diff = manager.diff([]);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].name).toBe('WillBeRemoved');
    });

    it('should detect changed entries', async () => {
      await manager.set('Changed', Buffer.from('original'), {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      });

      const diff = manager.diff([
        { name: 'Changed', contentHash: 'different-hash', framePath: 'Frame' },
      ]);

      expect(diff.changed).toHaveLength(1);
      expect(diff.changed[0].old.name).toBe('Changed');
    });
  });

  describe('getImage', () => {
    it('should retrieve baseline image', async () => {
      const testImage = Buffer.from('image-content');
      await manager.set('WithImage', testImage, {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      });

      const image = await manager.getImage('WithImage');
      expect(image?.toString()).toBe('image-content');
    });

    it('should return null for missing image', async () => {
      const image = await manager.getImage('NonExistent');
      expect(image).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should persist across instances', async () => {
      await manager.set('Persistent', Buffer.from('data'), {
        framePath: 'Frame',
        figmaFile: 'file',
        nodeId: 'node',
        viewport: { width: 100, height: 100 },
      });

      // Create new manager instance
      const newManager = createBaselineManager(TEST_BASELINE_DIR);
      await newManager.loadManifest();

      expect(newManager.get('Persistent')).toBeDefined();
    });
  });
});
