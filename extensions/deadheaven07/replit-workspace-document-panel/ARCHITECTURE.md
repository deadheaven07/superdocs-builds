# SuperDocs Replit Workspace Document Panel — Architecture Document

## Overview

This document describes the architecture of the SuperDocs Replit Workspace Document Panel — a Replit extension that enables developers to generate, review, and export documentation (README, SPEC, User Guide) from their codebase using the SuperDocs AI platform.

---

## System Context

```
┌─────────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   Replit Workspace  │────▶│  Extension UI    │────▶│  SuperDocs API     │
│  (Source Code)      │     │  (React + TS)    │     │  (REST + JSON)     │
└─────────────────────┘     └──────────────────┘     └────────────────────┘
        ▲                           │                        │
        │                           ▼                        ▼
        │                    ┌──────────────────┐     ┌────────────────────┐
        │                    │  State Layer     │     │  Document Export   │
        │                    │ (localStorage +  │     │  (PDF/DOCX Blob)   │
        │                    │  .superdocs-     │     └────────────────────┘
        │                    │  state.json)     │
        │                           │
        └───────────────────────────┘
              (File Read/Write)
```

---

## Component Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React UI Layer                              │
│  DocumentPanel │ FileTree │ DraftTab │ ReviewTab │ ExportTab   │
├─────────────────────────────────────────────────────────────────┤
│                      Hook Layer                                 │
│  useSuperDocs │ useFileHashes │ useStatePersistence │ useWorkspaceFiles │
├─────────────────────────────────────────────────────────────────┤
│                    Service Layer                                │
│        superdocs.ts │ replit.ts │ context.ts                   │
├─────────────────────────────────────────────────────────────────┤
│                    External APIs                                │
│         SuperDocs REST API  │  Replit Extensions API           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Data Flow

### 1. Initial Document Generation

```
User Action (DraftTab)
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ FILE INGESTION                                                 │
│  1. Read selected files via useWorkspaceFiles.readFile()     │
│  2. Build Map<path, content>                                 │
│  3. Capture SHA-256 baseline via useFileHashes.captureHashes │
│     → persisted to localStorage + .superdocs-state.json       │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ CONTEXT BUILDING                                               │
│  createGenerationContext() merges:                            │
│    • Instruction (user + default template per doc type)       │
│    • Project context: files → markdown (500KB cap)            │
│    • Warning injection if files skipped due to size limit     │
│  buildSuperDocsInstruction() formats final prompt             │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ SUPERDOCS API                                                  │
│  1. uploadDocument(filename, instruction)                     │
│     → POST /v1/documents/upload-base64                        │
│  2. chatAsync(message, session_id, approval_mode)             │
│     → POST /v1/chat/async → { job_id }                        │
│  3. waitForJob(job_id) — polls /v1/jobs/{jobId} every 3s     │
│  4. If awaiting_approval:                                     │
│     → Parse metadata.pending_changes (double-JSON)            │
│     → Set state: proposedChanges=batch, step=awaiting_approval│
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ REVIEW UI (ReviewTab)                                         │
│  • Renders ProposedChange[] as cards with diffs               │
│  • Actions: Approve All / Reject All / Continue / Stop       │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ APPROVAL / CONTINUATION                                        │
│  approveChanges(approved, changes[])                          │
│   → POST /v1/chat/{sessionId}/approve                         │
│ continueJob(continue)                                         │
│   → POST /v1/chat/{sessionId}/continue                        │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│ EXPORT                                                         │
│  1. exportDocument({ session_id, format })                    │
│     → POST /v1/documents/export → { download_url }            │
│  2. downloadExport(download_url) → Blob                       │
│  3. writeFile(destination, blob) → Replit workspace           │
│  4. captureHashes(files) — updates baseline                   │
└──────────────────────────────────────────────────────────────┘
```

### 2. Regeneration Flow

```
User clicks "Regenerate Document"
         │
         ▼
Re-read all originally selected files from workspace
         │
         ▼
Rebuild context with CURRENT file contents
         │
         ▼
Call generateDocument(same instruction, same session_id)
         │
         ▼
SuperDocs returns new ProposedChangeBatch
         │
         ▼
User reviews → approves → exports → baseline updated
```

---

## State Management

### Dual-Layer Persistence

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTED STATE                              │
├─────────────────────────────────────────────────────────────────┤
│ sessionId         │ SuperDocs session ID                       │
│ documentId        │ SuperDocs document ID                      │
│ documentType      │ 'readme' | 'spec' | 'user-guide'           │
│ selectedPaths     │ string[] — user-selected file paths        │
│ fileHashes        │ Record<path, SHA256> — baseline hashes     │
│ originalInstruction│ string — user's original prompt           │
│ lastInstruction   │ string — last sent instruction             │
│ jobId             │ string — current SuperDocs job ID          │
│ proposedChanges   │ ProposedChangeBatch — pending review       │
│ exportResult      │ ExportResult — last export metadata        │
│ lastUpdated       │ number — timestamp for merge conflict      │
│ version           │ number — schema version                    │
└─────────────────────────────────────────────────────────────────┘
```

**Dual Storage:**
- **localStorage** — instant, per-browser
- **`.superdocs-state.json`** (workspace root) — survives browser clear, portable

**Merge Strategy:** On load, pick source with newer `lastUpdated`.

### File Hash Baseline (SHA-256)

```typescript
// Per-file hash
const hash = await crypto.subtle.digest('SHA-256', encoder.encode(content))

// Change detection
function detectChangedFiles(prev, curr): ChangeSet {
  // Returns { changed: [], added: [], removed: [] }
}
```

**Why SHA-256:** Content-addressable, immune to timestamp/permission noise in containers.

---

## SuperDocs API Integration

### Key Endpoints

| Operation | Endpoint | Method | Retries |
|-----------|----------|--------|---------|
| Init Session | `/v1/sessions/init` | POST | 3× |
| Upload Document | `/v1/documents/upload-base64` | POST | 0 |
| Chat/Edit | `/v1/chat/async` | POST | 0 |
| Poll Job | `/v1/jobs/{jobId}` | GET | 3× |
| Approve Changes | `/v1/chat/{sessionId}/approve` | POST | 0 |
| Continue Job | `/v1/chat/{sessionId}/continue` | POST | 0 |
| Export Document | `/v1/documents/export` | POST | 0 |
| Download Export | `{download_url}` | GET | 0 |

### Critical: Mutation-Safe Retry Policy

| Classification | Operations | Retries |
|----------------|------------|---------|
| **Safe (Read)** | `initSession`, `pollJob`, `waitForJob` | 3× (1s→2s→4s) |
| **Mutation** | `uploadDocument`, `chatAsync`, `approveChanges`, `continueJob`, `exportDocument` | **0** |

**Invariant:** *Never retry mutations* — prevents duplicate documents/jobs/exports.

### Double-JSON Decoding (SuperDocs Quirk)

```typescript
// pending_changes is double-JSON-encoded
const outer = JSON.parse(response);           // Pass 1: API envelope
const inner = outer.content;                   // ← Double-encoded!
const batch = typeof inner === 'string' 
  ? JSON.parse(inner)                         // Pass 2: actual payload
  : inner;
```

---

## Resilience & Error Handling

### Retry Policy

| Error Type | Behavior |
|------------|----------|
| Network error / timeout | Retry (safe ops only) |
| 502 / 503 / 504 | Retry with backoff |
| 401 / 403 / 400 / 404 | No retry — surface immediately |
| AbortError | Suppressed — clean cancellation |

### Cancellation

```
AbortController → fetch() → all downstream promises
```

Propagation: `DocumentPanel.cancel() → useSuperDocs.cancel() → fetch.abort()`

### Error UI

| State | UI |
|-------|-----|
| Transient failure | Error banner with "Retry" / "Dismiss" |
| Cancelled | No error — clean abort |
| Fatal | Error banner, "Retry" re-runs last generation |

---

## Security Model

| Boundary | Protection |
|----------|------------|
| API Key | React memory only — never localStorage/sessionStorage/git |
| SuperDocs Auth | Bearer token, CORS restricted to `*.replit.dev` |
| Replit Files | Sandboxed API, user consent for writes |
| Export Download | Short-lived URL (1hr), Bearer token required |
| CORS | Direct browser → `api.superdocs.app` |

---

## Testing Strategy

### Test Coverage (61 tests)

| File | Tests | Focus |
|------|-------|-------|
| `superdocs.test.ts` | 10 | Client CRUD, errors |
| `parser.test.ts` | 7 | Double-JSON decoding |
| `hash.test.ts` | 13 | SHA-256, change detection |
| `context.test.ts` | 9 | Context building, warnings |
| `replit.test.ts` | 2 | Directory traversal |
| `revision.test.ts` | 20 | **Regression suite** |

### Critical Regressions Covered

| Bug | Test |
|-----|------|
| Instruction accumulation | Stable original instruction used |
| Empty project context | Regeneration uses CURRENT files |
| Session reuse | Same `session_id` across revisions |
| Retry exhaustion | Max 3 retries respected |
| Non-retriable errors | 401/403 not retried |
| Mutation non-retry | Upload/chat/approve called once |

### Mock Strategy

```typescript
// Global fetch mock
global.fetch = vi.fn()

// Per-test
mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({...}) })
mockFetch.mockRejectedValueOnce(new Error('Network error'))
```

---

## File Structure

```
src/
├── main.tsx                 # React 18 bootstrap
├── App.tsx                  # Root wrapper
├── components/
│   ├── DocumentPanel.tsx    # Root orchestrator
│   ├── FileTree.tsx         # Recursive file browser
│   ├── DraftTab.tsx         # Generation UI
│   ├── ReviewTab.tsx        # Changes review
│   ├── ExportTab.tsx        # PDF/DOCX export
│   └── StatusBadge.tsx      # Progress stepper
├── hooks/
│   ├── useSuperDocs.ts      # Core state machine
│   ├── useFileHashes.ts     # SHA-256 baselines
│   ├── useStatePersistence.ts # Dual-layer storage
│   └── useWorkspaceFiles.ts   # Replit API wrapper
├── services/
│   ├── superdocs.ts         # REST client + retry
│   ├── replit.ts            # Workspace API
│   └── context.ts           # Context builder
├── types/
│   └── superdocs.ts         # API contracts
├── utils/
│   ├── hash.ts              # SHA-256 + diff
│   └── parser.ts            # Double-JSON decoder
└── styles/
    └── index.css
```

---

## Known Limitations

1. **CORS**: Requires `api.superdocs.app` to allow `*.replit.dev`
2. **File Limits**: Replit API ~5MB read / ~2MB write
3. **No Background**: Polling stops when panel closed
4. **Single User**: Runs as current Replit user

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| First-Session UX | ✅ |
| Regeneration from Source | ✅ |
| Security (no keys in storage) | ✅ |
| Double-JSON Parse | ✅ |
| Retry Policy (safe only) | ✅ |
| Cancellation (HTTP layer) | ✅ |
| Error Recovery UI | ✅ |
| Revision Stability | ✅ |
| State Persistence | ✅ |
| Regeneration from Source | ✅ |

---

*Last updated: 2024 — Architecture reflects post-refactor simplified codebase*