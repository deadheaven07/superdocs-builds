# Replit Workspace Document Panel

A Replit extension that provides a document panel for generating, reviewing, and exporting documentation (README, SPEC, User Guide) using SuperDocs AI directly inside your Replit workspace.

## What it does

This extension adds a panel to your Replit workspace that enables you to:

- **Browse project files** - Recursive file tree with search, multi-select, and smart ignore rules (excludes node_modules, .env, lockfiles, binaries)
- **Generate documentation** - Create README, SPEC, or User Guide from selected source files using SuperDocs AI
- **Review AI changes** - Human-in-the-loop approval flow with diff view (insert/replace/delete operations)
- **Export to PDF/DOCX** - One-click export with overwrite protection, saved directly to your workspace
- **Regenerate from source** - Hash-diff based regeneration that only sends changed files to SuperDocs, preserving approved sections
- **Version history** - Browse, preview, and revert to previous document versions
- **Template gallery** - Apply SuperDocs templates and prompts with variable injection

## How it works

```
Project Files → Select Context → SuperDocs Upload → Chat/Generation → Proposed Changes → Review & Approve → Export → Workspace
                    ↓                                                                    ↑
              SHA-256 Baseline ──────────────────────────────────────────────────────────┘
                    (stored in .superdocs-state.json + localStorage)
```

### Regeneration Flow (Zero-Drift)

1. Initial generation captures SHA-256 hashes of selected files
2. On code changes, "Regenerate from Source" computes diff against baseline
3. Only changed/added/removed files are sent to SuperDocs with original instruction
4. SuperDocs returns granular proposed changes (not full rewrite)
5. Previously approved sections whose source files are unchanged are never re-proposed

## Prerequisites

- A Replit account with a project/repl
- SuperDocs API key (get one at https://use.superdocs.app)
- Node.js 18+ (for local development)

## Installation

### In Replit (Recommended)

1. Open your Repl
2. Open the Extensions panel (puzzle piece icon in sidebar)
3. Search for "SuperDocs Document Panel" or install from local build:
   ```bash
   # In your Repl's shell
   git clone <this-repo>
   cd superdocs-builds/extensions/deadheaven07/replit-workspace-document-panel
   npm install
   npm run build
   ```
4. Click "Install" on the extension

### Local Development

```bash
cd extensions/deadheaven07/replit-workspace-document-panel
npm install
npm run dev    # Starts Vite dev server on port 5173
```

Then in your Repl, use the "Local Extension" feature to load from `http://localhost:5173`.

## Usage

1. **Open the panel** - Click the SuperDocs icon in the Replit sidebar
2. **Select files** - Check boxes in the file tree to include files as context
3. **Choose document type** - Switch to Draft tab, pick README/SPEC/User Guide
4. **Generate** - Click "Generate Document" (enter API key on first use)
5. **Review** - Switch to Review tab, see proposed changes with diffs
6. **Approve** - Click "Approve Changes" or "Reject"
7. **Export** - Switch to Export tab, choose PDF or DOCX, set destination path
8. **Regenerate** - After code changes, click "Regenerate from Source" to update only affected sections

## SuperDocs API Key

Enter your API key in the panel header when prompted. The key is:
- Stored only in React memory (not persisted)
- Never written to localStorage, workspace files, or logs
- Sent directly to `api.superdocs.app` via CORS

## Configuration

No configuration files needed. The extension uses:
- `.superdocs-state.json` in workspace root (session state, file hashes)
- Browser localStorage (fallback for session persistence)

## Project Structure

```
src/
├── main.tsx                 # React 18 bootstrap
├── App.tsx                  # Root wrapper
├── components/
│   ├── DocumentPanel.tsx    # Root orchestrator (tabs, state)
│   ├── FileTree.tsx         # Recursive file browser with search
│   ├── DraftTab.tsx         # Generation UI (doc type, instruction)
│   ├── ReviewTab.tsx        # Proposed changes diff view
│   ├── ExportTab.tsx        # PDF/DOCX export with overwrite check
│   ├── HistoryTab.tsx       # Version history browser
│   ├── TemplateGallery.tsx  # Templates & prompts with variables
│   └── StatusBadge.tsx      # Progress stepper
├── hooks/
│   ├── useSuperDocs.ts      # Core state machine (generate, approve, export)
│   ├── useFileHashes.ts     # SHA-256 baseline capture & diff
│   ├── useStatePersistence.ts # Dual-layer persistence (localStorage + workspace)
│   └── useWorkspaceFiles.ts   # Replit filesystem API wrapper
├── services/
│   ├── superdocs.ts         # SuperDocs REST client with retry policy
│   ├── replit.ts            # Workspace context building & file I/O
│   ├── context.ts           # Initial-generation context builder
│   └── revision.ts          # Diff computation & thin revision messages
├── types/
│   ├── superdocs.ts         # SuperDocs API contracts
│   └── replit-extensions.d.ts # @replit/extensions type declarations
└── utils/
    ├── hash.ts              # SHA-256 + change detection
    └── parser.ts            # Double-JSON decoder for pending_changes
```

## Testing

```bash
npm test        # Run all 84 unit tests
npm run lint    # ESLint check
```

Tests cover:
- Double-JSON parsing (SuperDocs quirk)
- SHA-256 hashing (with NIST test vectors)
- Change detection (added/changed/removed files)
- Context building (500KB cap, warnings)
- Persistence merge (browser refresh, container re-entry)
- Revision flow (zero-drift, instruction stability, session reuse)
- SuperDocs client (retry policy, mutation safety, error handling)

## SuperDocs API Integration

### Endpoints Used

| Operation | Endpoint | Method | Retries |
|-----------|----------|--------|---------|
| Init Session | `/v1/sessions/init` | POST | 3× |
| Upload Document | `/v1/documents/upload-base64` | POST | 0 (mutation) |
| Chat/Edit | `/v1/chat/async` | POST | 0 (mutation) |
| Poll Job | `/v1/jobs/{jobId}` | GET | 3× |
| Approve Changes | `/v1/chat/{sessionId}/approve` | POST | 0 (mutation) |
| Continue Job | `/v1/chat/{sessionId}/continue` | POST | 0 (mutation) |
| Export Document | `/v1/documents/export` | POST | 0 (mutation) |
| Download Export | `{download_url}` | GET | 0 |
| Sync HTML | `/v1/documents/sync-html` | POST | 0 (mutation) |
| Versions | `/v1/documents/{id}/versions` | GET | 3× |
| Revert | `/v1/documents/{id}/versions/{v}/revert` | POST | 0 |
| Templates | `/v1/templates` | GET | 3× |
| Prompts | `/v1/prompts` | GET | 3× |

### Critical Implementation Details

- **Double-JSON decoding**: `pending_changes` is double-encoded; parser handles both string and object inner content
- **Mutation-safe retries**: Only safe reads (init, poll) retry; mutations never retry
- **Session continuity**: Same `session_id` reused across generate/regenerate/approve/export
- **Approval mode**: Always `ask_every_time` to enforce human review

## Security

- API key never persisted (React state only)
- `.env*` files excluded from file tree and context
- 500KB context cap prevents accidental large uploads
- Export download uses short-lived URLs with Bearer auth
- No secrets in generated documents (source files filtered)

## Known Limitations

1. Requires `api.superdocs.app` CORS to allow `*.replit.dev`
2. Replit API file size limits (~5MB read / ~2MB write)
3. Polling stops when panel closed (no background workers)
4. Runs as current Replit user (no service account)
5. Large projects may hit context cap (warning injected into instruction)

## License

MIT - see [LICENSE](../../../LICENSE) for details.