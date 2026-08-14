import { describe, it, expect, vi } from 'vitest';
import { sha256, detectChangedFiles, hasChanges, computeFileHashesAsync } from '../src/utils/hash';

describe('hash utilities', () => {
  describe('sha256', () => {
    it('produces consistent hash for same input', async () => {
      const input = 'test content';
      const hash1 = await sha256(input);
      const hash2 = await sha256(input);
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different input', async () => {
      const hash1 = await sha256('content a');
      const hash2 = await sha256('content b');
      expect(hash1).not.toBe(hash2);
    });

    it('produces 64 character hex string', async () => {
      const hash = await sha256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('detectChangedFiles', () => {
    it('detects changed files', () => {
      const previous = { 'file1.ts': 'hash1', 'file2.ts': 'hash2' };
      const current = { 'file1.ts': 'hash1', 'file2.ts': 'hash3' };
      
      const result = detectChangedFiles(previous, current);
      
      expect(result.changed).toEqual(['file2.ts']);
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
    });

    it('detects added files', () => {
      const previous = { 'file1.ts': 'hash1' };
      const current = { 'file1.ts': 'hash1', 'file2.ts': 'hash2' };
      
      const result = detectChangedFiles(previous, current);
      
      expect(result.changed).toEqual([]);
      expect(result.added).toEqual(['file2.ts']);
      expect(result.removed).toEqual([]);
    });

    it('detects removed files', () => {
      const previous = { 'file1.ts': 'hash1', 'file2.ts': 'hash2' };
      const current = { 'file1.ts': 'hash1' };
      
      const result = detectChangedFiles(previous, current);
      
      expect(result.changed).toEqual([]);
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual(['file2.ts']);
    });

    it('handles multiple changes', () => {
      const previous = { 'a.ts': 'h1', 'b.ts': 'h2', 'c.ts': 'h3' };
      const current = { 'a.ts': 'h1', 'b.ts': 'h4', 'd.ts': 'h5' };
      
      const result = detectChangedFiles(previous, current);
      
      expect(result.changed).toContain('b.ts');
      expect(result.added).toContain('d.ts');
      expect(result.removed).toContain('c.ts');
    });
  });

  describe('hasChanges', () => {
    it('returns true when files changed', () => {
      const previous = { 'file1.ts': 'hash1' };
      const current = { 'file1.ts': 'hash2' };
      expect(hasChanges(previous, current)).toBe(true);
    });

    it('returns true when files added', () => {
      const previous = { 'file1.ts': 'hash1' };
      const current = { 'file1.ts': 'hash1', 'file2.ts': 'hash2' };
      expect(hasChanges(previous, current)).toBe(true);
    });

    it('returns true when files removed', () => {
      const previous = { 'file1.ts': 'hash1', 'file2.ts': 'hash2' };
      const current = { 'file1.ts': 'hash1' };
      expect(hasChanges(previous, current)).toBe(true);
    });

    it('returns false when no changes', () => {
      const previous = { 'file1.ts': 'hash1' };
      const current = { 'file1.ts': 'hash1' };
      expect(hasChanges(previous, current)).toBe(false);
    });
  });

  describe('computeFileHashesAsync', () => {
    it('computes hashes for multiple files', async () => {
      const files = new Map([
        ['file1.ts', 'content 1'],
        ['file2.ts', 'content 2'],
        ['file3.ts', 'content 3'],
      ]);

      const hashes = await computeFileHashesAsync(files);
      
      expect(Object.keys(hashes)).toHaveLength(3);
      expect(hashes['file1.ts']).toBeDefined();
      expect(hashes['file2.ts']).toBeDefined();
      expect(hashes['file3.ts']).toBeDefined();
    });

    it('produces different hashes for different content', async () => {
      const files = new Map([
        ['same1.ts', 'same content'],
        ['same2.ts', 'same content'],
        ['diff.ts', 'different content'],
      ]);

      const hashes = await computeFileHashesAsync(files);
      
      expect(hashes['same1.ts']).toBe(hashes['same2.ts']);
      expect(hashes['same1.ts']).not.toBe(hashes['diff.ts']);
    });
  });
});