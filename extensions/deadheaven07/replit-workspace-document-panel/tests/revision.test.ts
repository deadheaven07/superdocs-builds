import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildProjectContext } from '../src/services/replit';
import { buildRevisionInstruction, createGenerationContext } from '../src/services/context';
import { computeFileHashesAsync, detectChangedFiles } from '../src/utils/hash';
import { createSuperDocsClient } from '../src/services/superdocs';

const mockFiles = new Map([
  ['src/main.ts', 'export function main() { console.log("hello"); }'],
  ['package.json', '{"name": "test", "version": "1.0.0"}'],
  ['README.md', '# Test Project\n\nA simple test project.'],
]);

const mockChangedFiles = new Map([
  ['src/main.ts', 'export function main() { console.log("hello world"); }'], // CHANGED
  ['package.json', '{"name": "test", "version": "1.0.0"}'],
  ['README.md', '# Test Project\n\nA simple test project.'],
]);

describe('Revision flow regression tests', () => {
  describe('buildRevisionInstruction with actual project context', () => {
    it('includes CURRENT project context when files have changed', () => {
      // Create context with ORIGINAL files
      const originalContext = createGenerationContext('readme', 'Original instruction', mockFiles);
      
      // Simulate file change
      const changedContext = createGenerationContext('readme', 'Original instruction', mockChangedFiles);
      
      // Build revision instruction with CHANGED context (simulating the fix)
      const revisionInstruction = buildRevisionInstruction(changedContext, ['src/main.ts']);
      
      // Verify the revision instruction contains the UPDATED file content
      expect(revisionInstruction).toContain('Project Context (Updated)');
      expect(revisionInstruction).toContain('console.log("hello world")'); // NEW content
      expect(revisionInstruction).not.toContain('console.log("hello")'); // OLD content
    });

    it('does NOT use empty project context (regression test for empty projectContext bug)', () => {
      const context = createGenerationContext('readme', 'Test', mockFiles);
      
      // This simulates the OLD buggy behavior
      const buggyContext = {
        ...context,
        projectContext: '', // This was the bug
      };
      
      const buggyInstruction = buildRevisionInstruction(buggyContext, ['src/main.ts']);
      
      // The buggy version would have empty project context
      expect(buggyInstruction).toContain('Project Context (Updated)');
      // But the project context section would be empty
      const contextSection = buggyInstruction.split('Project Context (Updated)')[1];
      expect(contextSection?.trim()).toBe('');
      
      // The FIXED version should have actual content
      const fixedInstruction = buildRevisionInstruction(context, ['src/main.ts']);
      const fixedContextSection = fixedInstruction.split('Project Context (Updated)')[1];
      expect(fixedContextSection?.trim()).not.toBe('');
      expect(fixedContextSection).toContain('src/main.ts');
    });
  });

  describe('Changed file detection with SHA-256', () => {
    it('detects changed files correctly', async () => {
      const originalHashes = await computeFileHashesAsync(mockFiles);
      const changedHashes = await computeFileHashesAsync(mockChangedFiles);
      
      const changes = detectChangedFiles(originalHashes, changedHashes);
      
      expect(changes.changed).toContain('src/main.ts');
      expect(changes.added).toHaveLength(0);
      expect(changes.removed).toHaveLength(0);
    });

    it('detects added files', async () => {
      const originalHashes = await computeFileHashesAsync(mockFiles);
      const withNewFile = new Map([...mockFiles, ['src/new.ts', 'export const x = 1;']]);
      const newHashes = await computeFileHashesAsync(withNewFile);
      
      const changes = detectChangedFiles(originalHashes, newHashes);
      
      expect(changes.added).toContain('src/new.ts');
    });

    it('detects removed files', async () => {
      const originalHashes = await computeFileHashesAsync(mockFiles);
      const withoutFile = new Map([['package.json', mockFiles.get('package.json')!], ['README.md', mockFiles.get('README.md')!]]);
      const newHashes = await computeFileHashesAsync(withoutFile);
      
      const changes = detectChangedFiles(originalHashes, newHashes);
      
      expect(changes.removed).toContain('src/main.ts');
    });
  });

  describe('Revision context uses CURRENT file contents', () => {
    it('buildProjectContext includes current file contents', () => {
      const { context } = buildProjectContext(mockChangedFiles, 'readme');
      
      expect(context).toContain('console.log("hello world")'); // NEW content
      expect(context).not.toContain('console.log("hello")'); // OLD content
      expect(context).toContain('src/main.ts');
    });

    it('includes all selected files in context', () => {
      const { context } = buildProjectContext(mockChangedFiles, 'readme');
      
      expect(context).toContain('src/main.ts');
      expect(context).toContain('package.json');
      expect(context).toContain('README.md');
    });
  });

  describe('SuperDocs session reuse', () => {
    it('reuses session ID across revision', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ // initSession
          ok: true,
          json: async () => ({ session_id: 'session-123' }),
        })
        .mockResolvedValueOnce({ // uploadDocument
          ok: true,
          json: async () => ({
            session_id: 'session-123',
            document_id: 'doc-456',
            chunks_count: 5,
            version_id: 'v1',
            page_setup: {},
            html: '<html>Test</html>',
          }),
        })
        .mockResolvedValueOnce({ // chatAsync (initial)
          ok: true,
          json: async () => ({ job_id: 'job-1' }),
        })
        .mockResolvedValue({ // pollJob
          ok: true,
          json: async () => ({
            job_id: 'job-1',
            status: 'completed',
          }),
        });

      global.fetch = mockFetch;
      
      const client = createSuperDocsClient('test-key');
      
      // Initial generation
      const uploadResult = await client.uploadDocument('README.md', '# Test');
      const jobId1 = await client.chatAsync({
        message: 'Generate README',
        session_id: uploadResult.session_id,
      });
      
      expect(uploadResult.session_id).toBe('session-123');
      
      // Revision - should reuse same session
      const jobId2 = await client.chatAsync({
        message: 'Update README',
        session_id: uploadResult.session_id, // SAME session
      });
      
      expect(jobId2).toBe('job-1'); // Same job ID from mock
      expect(mockFetch).toHaveBeenCalledTimes(4); // init + upload + 2 chatAsync
    });
  });
});