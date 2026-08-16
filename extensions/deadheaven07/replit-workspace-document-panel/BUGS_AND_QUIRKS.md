# SuperDocs API - Bugs, Quirks & Integration Notes

Documenting real-world API behavior discovered during development of the Replit Workspace Document Panel extension.

---

## 1. Double-JSON Encoding in `pending_changes`

**Behavior:** The `pending_changes` field in `JobStatus.metadata` is a **double-JSON-encoded string**.

```json
{
  "metadata": {
    "pending_changes": "{\"batch_id\":\"...\",\"changes\":[{\"change_id\":\"...\"}]}"
  }
}
```

**Required parsing:** Two-pass JSON decode:
```typescript
const outer = JSON.parse(response.metadata.pending_changes);
const inner = JSON.parse(outer.content); // <-- second parse needed
```

**Why it matters:** Single `JSON.parse()` returns a string, not an object. The parser in `src/utils/parser.ts` handles both string and object inner content.

---

## 2. `chatAsync` Payload Requirements

**Required fields:**
```typescript
{
  message: string;           // The instruction/prompt
  session_id: string;        // Must reuse existing session for continuity
  approval_mode: 'ask_every_time' | 'auto_approve' | 'never';
  model_tier: 'core' | 'premium';
}
```

**Critical:** Omitting `approval_mode` defaults to `never`, which returns completed document without review. Always use `'ask_every_time'` for review workflow.

---

## 3. Session Continuity

**Behavior:** `session_id` must be reused across:
- Initial document upload (`uploadDocument`)
- All subsequent `chatAsync` calls (regenerations, revisions)
- `approveChanges` and `continueJob` calls
- `exportDocument`

**Implementation:** Store `session_id` from initial `uploadDocument` response and persist in `.superdocs-state.json`.

**Gotcha:** Creating a new session for each regeneration loses document history and context.

---

## 4. `pending_changes` Field Variability

**Field location:** `jobStatus.metadata.pending_changes`

**Type variability:**
- Sometimes `string` (double-JSON)
- Sometimes `object` (already parsed)
- Sometimes `undefined` (when `status !== 'awaiting_approval'`)

**Safe access pattern:**
```typescript
const pending = jobStatus.metadata?.pending_changes;
if (pending) {
  const content = typeof pending === 'string' ? pending : JSON.stringify(pending);
  const batch = parseProposedChangeBatch(content);
}
```

---

## 4. `approveChanges` Requires Full Change Objects

**Payload:**
```typescript
{
  session_id: string;
  job_id: string;
  approved: boolean;
  changes: ProposedChange[]; // Must include ALL changes from the batch
}
```

**Important:** You must send back the **full original `ProposedChange` objects** from the batch. Cannot send just IDs. The API validates the full object structure.

---

## 5. `continueJob` Payload

**Payload:**
```typescript
{
  job_id: string;
  continue: boolean;
}
```

**Behavior:**
- `continue: true` → SuperDocs continues generation (may return more changes)
- `continue: false` → Stops job, marks as completed

**Session requirement:** Must pass `sessionId` in URL path: `/v1/chat/${sessionId}/continue`

---

## 6. Export Flow

**Two-step process:**
1. `exportDocument({ session_id, format })` → returns `{ download_url, format, expires_at }`
2. `downloadExport(downloadUrl)` → returns `Blob`

**Auth:** Download requires `Authorization: Bearer <apiKey>` header on the download URL.

**Expiration:** Download URLs expire (typically 1 hour). Download immediately after generation.

---

## 6. Retry Policy Edge Cases

**Operations that retry (safe/read):**
- `initSession` (idempotent-ish)
- `pollJob` / `waitForJob` (read-only)
- `downloadExport` (safe)

**Operations that DO NOT retry (mutations):**
- `uploadDocument` (creates document)
- `chatAsync` (starts job)
- `approveChanges` (modifies document)
- `continueJob` (modifies job state)
- `exportDocument` (generates export)

**Reason:** Retrying mutations can create duplicate documents, jobs, or exports.

---

## 7. `approval_mode` Values

| Value | Behavior |
|-------|----------|
| `ask_every_time` | Returns `awaiting_approval` with `ProposedChangeBatch` after each generation |
| `auto_approve` | Auto-applies changes, returns `completed` |
| `never` | Returns `completed` without changes |

**Recommendation:** Always use `ask_every_time` for human-in-the-loop workflows.

---

## 7. Job Status Values

| Status | Meaning |
|--------|---------|
| `processing` | Job is running |
| `awaiting_approval` | Changes ready for review (check `metadata.pending_changes`) |
| `completed` | Job finished successfully |
| `failed` | Job failed (check `error` field) |

**Polling:** Use `waitForJob` with 3s interval, max 200 polls (10 min timeout).

---

## 8. Error Response Format

**Non-2xx responses:**
```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE"
}
```

**Common codes:**
- `401` - Invalid/expired API key
- `403` - API key lacks permission
- `404` - Session/document/job not found
- `500` - Internal server error (retryable)
- `503` - Service unavailable (retryable)

---

## 8. CORS & Browser Constraints

**Requirement:** `api.superdocs.app` must allow requests from `*.replit.dev` origins.

**Current status:** Works in Replit browser environment. Local development may need proxy or CORS configuration.

---

## 9. File Size Limits

**Replit workspace API:**
- Read limit: ~5MB per file
- Write limit: ~2MB per file

**SuperDocs API:**
- Document upload: base64 encoded, practical limit ~10MB
- Large documents may timeout during generation

---

## 9. API Latency Observations

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| `initSession` | 200-500ms | Fast |
| `uploadDocument` | 500ms-2s | Depends on document size |
| `chatAsync` | <100ms | Returns job_id immediately |
| `pollJob` (first) | 1-5s | First poll often returns quickly |
| `pollJob` (subsequent) | 2-10s | Generation takes time |
| `approveChanges` | 2-8s | Applies changes to document |
| `exportDocument` | 3-10s | PDF/DOCX generation |
| `downloadExport` | 1-3s | Binary download |

**Note:** Generation time scales with document complexity. Long-running jobs (>60s) may need UI timeout handling.

---

## 10. TypeScript Type Quirks

**`JobStatus.metadata`** is typed as `Record<string, unknown>` but contains structured data. Cast or use type guards:

```typescript
interface JobMetadata {
  pending_changes?: string | ProposedChangeBatch;
  continue_prompt?: Record<string, unknown>;
}

const metadata = jobStatus.metadata as JobMetadata;
```

---

## 11. Testing Notes

**Mocking fetch:** Tests mock `global.fetch` with vi.fn(). Remember to:
- Clear mocks in `beforeEach`
- Mock both success and error responses
- Test retry logic with network errors
- Test mutation non-retry behavior

**Key test scenarios:**
- Double-JSON parsing (string vs object inner content)
- Retry exhaustion (max retries respected)
- Non-retriable errors (401/403 not retried)
- 503 retries
- Mutation non-retry (upload, chatAsync, approve, continue, export)

---

## 12. Known Limitations / Future Improvements

1. **No WebSocket/Server-Sent Events** - Must poll for job status
2. **No Partial Approve** - Must approve/reject entire batch
3. **No Chunk-Level Diff API** - Changes returned as HTML snippets
4. **No Document Version History API** - Must manage locally
5. **Session Expiry** - Sessions may expire after inactivity (TTL unknown)
6. **No Batch Operations** - Each operation is a separate HTTP request

---

## 13. Quick Reference: REST Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Init Session | `/v1/sessions/init` | POST |
| Upload Document | `/v1/documents/upload-base64` | POST |
| Chat/Edit | `/v1/chat/async` | POST |
| Poll Job | `/v1/jobs/{jobId}` | GET |
| Approve Changes | `/v1/chat/{sessionId}/approve` | POST |
| Continue Job | `/v1/chat/{sessionId}/continue` | POST |
| Export Document | `/v1/documents/export` | POST |
| Download Export | `{download_url}` | GET |

---

*Last updated: 2024 - Based on SuperDocs API integration for Replit Workspace Document Panel*