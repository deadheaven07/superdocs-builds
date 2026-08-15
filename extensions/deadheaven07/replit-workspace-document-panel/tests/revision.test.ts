import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildProjectContext } from '../src/services/replit';
import { buildRevisionInstruction, createGenerationContext } from '../src/services/context';
import { computeFileHashesAsync, detectChangedFiles } from '../src/utils/hash';
import { createSuperDocsClient, SuperDocsClient } from '../src/services/superdocs';

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

    it('does NOT accumulate previous revision instructions (regression test for instruction accumulation bug)', () => {
      const context = createGenerationContext('readme', 'Original user instruction', mockFiles);

      // Simulate first revision
      const firstRevision = buildRevisionInstruction(context, ['src/main.ts'], 'Original user instruction');

      // Simulate buggy behavior where previous revision instruction is used as "previous instruction"
      const buggyContext = {
        ...context,
        instruction: firstRevision, // This is the bug - using full revision instruction
      };
      const buggySecondRevision = buildRevisionInstruction(buggyContext, ['package.json'], firstRevision);

      // The buggy version would contain the first revision's change list (src/main.ts)
      expect(buggySecondRevision).toContain('Original user instruction');
      expect(buggySecondRevision).toContain('Code Changes Detected');
      expect(buggySecondRevision).toContain('src/main.ts');
      expect(buggySecondRevision).toContain('package.json');

      // The FIXED version should only contain the original user instruction, not the full previous revision
      const fixedSecondRevision = buildRevisionInstruction(context, ['package.json'], 'Original user instruction');
      expect(fixedSecondRevision).toContain('Original user instruction');
      expect(fixedSecondRevision).toContain('Code Changes Detected');
      expect(fixedSecondRevision).toContain('package.json');
      // Should NOT contain the first revision's change list (src/main.ts in the changes section)
      // But it WILL contain src/main.ts in the project context (which is correct)
      const changesSection = fixedSecondRevision.split('Code Changes Detected')[1]?.split('---')[0] || '';
      expect(changesSection).not.toContain('src/main.ts');
      expect(changesSection).toContain('package.json');
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

describe('SuperDocsClient retry logic', () => {
  const apiKey = 'test-api-key';
  const baseUrl = 'https://api.superdocs.app';

  // Create client with test retry config
  function createTestClient() {
    return createSuperDocsClient(apiKey, baseUrl, { maxRetries: 3, retryDelayMs: 10 });
  }

  it('retries on network error and succeeds', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'session-123' }),
      });

    global.fetch = mockFetch;

    const client = createTestClient();
    const sessionId = await client.initSession();

    expect(sessionId).toBe('session-123');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('fails after max retries exhausted', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValue(new Error('Network error'));

    global.fetch = mockFetch;

    const client = createTestClient();
    await expect(client.initSession()).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it('does not retry on non-retriable errors (e.g., 401)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

    global.fetch = mockFetch;

    const client = createTestClient();
    await expect(client.initSession()).rejects.toThrow('SuperDocs API error (401)');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 service unavailable', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'session-123' }),
      });

    global.fetch = mockFetch;

    const client = createTestClient();
    const sessionId = await client.initSession();

    expect(sessionId).toBe('session-123');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry mutation POST requests (uploadDocument)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    global.fetch = mockFetch;

    const client = createTestClient();

    // uploadDocument should NOT retry (it's a mutation)
    // Provide sessionId to avoid initSession call which does retry
    await expect(client.uploadDocument('test.md', 'content', 'existing-session')).rejects.toThrow('Network error');
    // Should only be called once (no retries for mutations)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry chatAsync (mutation)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    global.fetch = mockFetch;

    const client = createTestClient();

    await expect(client.chatAsync({ message: 'test', session_id: 's1' })).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry approveChanges (mutation)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    global.fetch = mockFetch;

    const client = createTestClient();

    await expect(client.approveChanges({
      session_id: 's1',
      job_id: 'j1',
      approved: true,
      changes: []
    })).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry continueJob (mutation)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    global.fetch = mockFetch;

    const client = createTestClient();

    await expect(client.continueJob({ job_id: 'j1', continue: true }, 's1')).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry exportDocument (mutation)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    global.fetch = mockFetch;

    const client = createTestClient();

    await expect(client.exportDocument({ session_id: 's1', format: 'pdf' })).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries pollJob (safe read operation)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'j1', status: 'completed' }),
      });

    global.fetch = mockFetch;

    const client = createTestClient();
    const status = await client.pollJob('j1');

    expect(status.job_id).toBe('j1');
    expect(status.status).toBe('completed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries waitForJob (safe polling operation)', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'j1', status: 'completed' }),
      });

    global.fetch = mockFetch;

    const client = createTestClient();
    const status = await client.waitForJob('j1');

    expect(status.job_id).toBe('j1');
    expect(status.status).toBe('completed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});