import { describe, it, expect } from 'vitest';
import { SuperDocsClient } from '../../src/core/superdocs-client.js';

describe('SuperDocs API Client Adapter (Integration & Fallback)', () => {
  it('identifies unconfigured state when SUPERDOCS_API_KEY is unset/placeholder and falls back gracefully', async () => {
    const client = new SuperDocsClient({ apiKey: 'your-key-here' });
    expect(client.isConfigured()).toBe(false);

    const result = await client.syncArticle('art-100', 'Title', '# Content');
    expect(result.status).toBe('FALLBACK_LOCAL');
    expect(result.remoteDocumentId).toBe('doc-local-art-100');
  });

  it('recognizes configured state when a valid API key is passed', () => {
    const client = new SuperDocsClient({ apiKey: 'live_sk_test_12345' });
    expect(client.isConfigured()).toBe(true);
  });
});
