import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSuperDocsClient, SuperDocsClient } from '../src/services/superdocs';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SuperDocsClient', () => {
  let client: SuperDocsClient;
  const apiKey = 'test-api-key';
  const baseUrl = 'https://api.superdocs.app';

  beforeEach(() => {
    vi.clearAllMocks();
    client = createSuperDocsClient(apiKey, baseUrl);
  });

  describe('initSession', () => {
    it('calls correct endpoint and returns session_id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'session-123' }),
      });

      const sessionId = await client.initSession();
      
      expect(sessionId).toBe('session-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.superdocs.app/v1/sessions/init',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(client.initSession()).rejects.toThrow('SuperDocs API error (401)');
    });
  });

  describe('uploadDocument', () => {
    it('uploads document and returns result', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ session_id: 'session-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session_id: 'session-123',
            document_id: 'doc-456',
            chunks_count: 5,
            version_id: 'v1',
            page_setup: {},
            html: '<html>Test</html>',
          }),
        });

      const result = await client.uploadDocument('test.md', '# Test Content');
      
      expect(result.session_id).toBe('session-123');
      expect(result.document_id).toBe('doc-456');
      expect(result.chunks_count).toBe(5);
      expect(result.html).toBe('<html>Test</html>');
    });
  });

  describe('chatAsync', () => {
    it('starts chat job and returns job_id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'job-789' }),
      });

      const jobId = await client.chatAsync({
        message: 'Test instruction',
        session_id: 'session-123',
      });

      expect(jobId).toBe('job-789');
    });
  });

  describe('pollJob', () => {
    it('returns job status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-789',
          status: 'processing',
        }),
      });

      const status = await client.pollJob('job-789');
      
      expect(status.job_id).toBe('job-789');
      expect(status.status).toBe('processing');
    });
  });

  describe('approveChanges', () => {
    it('approves changes and returns job status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-789',
          status: 'completed',
        }),
      });

      const status = await client.approveChanges({
        session_id: 'session-123',
        job_id: 'job-789',
        approved: true,
        changes: [{ change_id: 'ch-1', operation: 'replace' }],
      });

      expect(status.job_id).toBe('job-789');
      expect(status.status).toBe('completed');
    });
  });

  describe('continueJob', () => {
    it('continues job and returns status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: 'job-789',
          status: 'completed',
        }),
      });

      const status = await client.continueJob(
        { job_id: 'job-789', continue: true },
        'session-123'
      );

      expect(status.job_id).toBe('job-789');
      expect(status.status).toBe('completed');
    });
  });

  describe('exportDocument', () => {
    it('exports document and returns result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          download_url: 'https://example.com/download.pdf',
          filename: 'export.pdf',
          format: 'pdf',
        }),
      });

      const result = await client.exportDocument({
        session_id: 'session-123',
        format: 'pdf',
      });

      expect(result.download_url).toBe('https://example.com/download.pdf');
      expect(result.format).toBe('pdf');
    });
  });

  describe('downloadExport', () => {
    it('downloads export blob', async () => {
      const mockBlob = new Blob(['test content'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => mockBlob,
      });

      const blob = await client.downloadExport('https://example.com/download.pdf');
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('includes status code in error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(client.initSession()).rejects.toThrow('SuperDocs API error (500)');
    });
  });
});