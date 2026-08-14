# Replit Workspace Document Panel

A Replit extension that adds a document panel to the workspace, allowing users to generate, edit, and export README, specification, and user guide documents using the SuperDocs AI platform.

## Features

- **Project File Discovery**: Recursively scans the Replit workspace, filtering out dependencies, build artifacts, and binary files
- **Smart File Selection**: Interactive file tree with checkboxes for selecting relevant source/config/documentation files
- **Document Generation**: Generate README, Technical Specification, or User Guide documents through SuperDocs AI
- **Edit Workflow**: Send natural language instructions to SuperDocs for iterative document refinement
- **Proposed Changes Review**: View and approve/reject AI-proposed changes with diff visualization
- **Export**: Export finished documents as styled PDF or DOCX
- **Workspace Integration**: Save exported artifacts directly into the Replit project
- **Revision Detection**: Detect code changes and regenerate documents reflecting those changes

## Architecture

```
��─────────────────────────────────────────────────────────────────��
│                    Replit Extension Panel                        │
│  ��──────────��  ��──────────��  ��──────────────��  ��────────────��  │
│  │  Files   │  │  Draft   │  │   Review     │  │  Export    │  │
│  │  Tree    │  │  Tab     │  │   Tab        │  │  Tab       │  │
│  └──────────��  └──────────��  └──────────────��  └────────────��  │
│         │            │               │               │          │
│         └────────────��───────────────��───────────────��          │
│                      ��                                           │
│         ��────────────────────────────��                          │
│         │     SuperDocs Client       │                          │
│         │  • upload_document         │                          │
│         │  • chat_async              │                          │
│         │  • poll_job                │                          │
│         │  • approve_changes         │                          │
│         │  • continue_job            │                          │
│         │  • export_document         │                          │
│         └────────────────────────────��                          │
│                      │                                           │
��──────────────────────��──────────────────────────────────────────��
                       ��
         ��────────────────────────────��
         │   Replit Workspace API     │
         │  • readDir (recursive)     │
         │  • readFile                │
         │  • writeFile               │
         │  • createDir               │
         └────────────────────────────��
```

## SuperDocs Integration

This extension uses the **SuperDocs REST API** (not MCP) with the following endpoints:

| Operation             | Endpoint                         | Method |
| --------------------- | -------------------------------- | ------ |
| Upload Document       | `/v1/documents/upload-base64`    | POST   |
| Chat/Edit Instruction | `/v1/chat/async`                 | POST   |
| Poll Job Status       | `/v1/jobs/{job_id}`              | GET    |
| Approve Changes       | `/v1/chat/{session_id}/approve`  | POST   |
| Continue Job          | `/v1/chat/{session_id}/continue` | POST   |
| Export Document       | `/v1/documents/export`           | POST   |

**Important**: SuperDocs returns proposed changes as a **double-JSON-encoded string** that requires two parse passes. This is handled automatically by the parser utility.

## Quick Start

### Prerequisites

- A Replit account
- A SuperDocs API key (get one at [use.superdocs.app](https://use.superdocs.app))

### Installation

1. **From Replit Extension Store** (when published):
   - Open any Repl
   - Click the Extensions panel (sidebar)
   - Search for "SuperDocs Document Panel"
   - Click Install

2. **For Development**:
   ```bash
   cd extensions/deadheaven07/replit-workspace-document-panel
   pnpm install
   pnpm dev
   ```
   Then open the Repl in Replit and the extension will load automatically.

### Configuration

1. Open the SuperDocs panel in Replit
2. Click "Set API Key"
3. Enter your SuperDocs API key (stored in memory only, never persisted)
4. The key is never saved to localStorage, sessionStorage, or committed to git

## Usage

### First-Time Document Generation

1. **Open the Panel**: Click "SuperDocs" in the Replit sidebar
2. **Select Files**: Check the files you want to include in the document context
   - The file tree excludes `node_modules`, `.git`, `dist`, `build`, `.env*`, lock files, and binaries
   - Ignored files are shown in gray with a reason
3. **Choose Document Type**:
   - **README** - Project overview, installation, usage, configuration
   - **SPEC** - Architecture, components, APIs, data models, deployment
   - **User Guide** - Tutorials, workflows, examples, troubleshooting
4. **Enter Instruction** (optional): Customize the generation prompt
5. **Click "Generate Document"**: Uploads context to SuperDocs and starts generation
6. **Review Proposed Changes**: SuperDocs returns proposed edits for your approval
7. **Approve/Reject**: Click "Approve All" or "Reject All" (or continue if prompted)
8. **Export**: Choose PDF or DOCX, set destination path (e.g., `docs/README.pdf`)
9. **Save**: Click "Export & Save" to write the artifact to your Replit workspace

### Revision After Code Changes

1. **Modify Project Code**: Edit source files in your Repl
2. **Return to Panel**: The "Check for Code Changes & Update Document" button appears after successful generation
3. **Click Update**: The extension re-scans selected files and detects changes
4. **Review Diff**: See which files changed since last generation
5. **Generate Revision**: SuperDocs uses the existing session to update the document
6. **Approve & Export**: Same workflow as initial generation

## File Selection Strategy

The file tree applies these filters automatically:

| Category                                          | Action                          |
| ------------------------------------------------- | ------------------------------- |
| `.git`, `node_modules`, `dist`, `build`, `.cache` | Excluded entirely               |
| `.env*`, `*.lock`                                 | Excluded (secrets/dependencies) |
| Binary files (images, fonts, PDFs, etc.)          | Excluded                        |
| Files > 100KB                                     | Truncated with notice           |
| All other files                                   | Included, user-selectable       |

## Security

- **API Key Handling**: Stored in React memory only, never in localStorage/sessionStorage
- **No Secret Leakage**: Key never appears in logs, error messages, or git history
- **User Consent**: Replit prompts for file write consent on first use
- **CORS**: Direct browser calls to `api.superdocs.app` (requires CORS support)

## Development

### Project Structure

```
extensions/deadheaven07/replit-workspace-document-panel/
├── .replit                    # Replit extension config
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite config
├── index.html                 # Entry HTML
├── .env.example               # API key placeholder
├── .gitignore                 # Git ignores
├── README.md                  # This file
├── src/
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # Root component
│   ├── components/            # UI components
│   │   ├── DocumentPanel.tsx  # Main panel
│   │   ├── FileTree.tsx       # File browser
│   │   ├── DraftTab.tsx       # Generation UI
│   │   ├── ReviewTab.tsx      # Changes review
│   │   ├── ExportTab.tsx      # Export UI
│   │   └── StatusBadge.tsx    # Status indicator
│   ├── services/              # Business logic
│   │   ├── superdocs.ts       # SuperDocs REST client
│   │   ├── replit.ts          # Replit workspace API
│   │   └── context.ts         # Context builder
│   ├── hooks/                 # React hooks
│   │   ├── useSuperDocs.ts    # SuperDocs state machine
│   │   ├── useWorkspaceFiles.ts # File operations
│   │   └── useFileHashes.ts   # Change detection
│   ├── types/                 # TypeScript types
│   │   └── superdocs.ts       # SuperDocs types
│   ├── utils/                 # Utilities
│   │   ├── hash.ts            # SHA-256 hashing
│   │   └── parser.ts          # Double-JSON parser
│   └── styles/
│       └── index.css          # Global styles
��── tests/
    ├── setup.ts               # Test mocks
    ├── superdocs.test.ts      # SuperDocs client tests
    ├── parser.test.ts         # Parser tests
    ├── hash.test.ts           # Hash tests
    ├── context.test.ts        # Context builder tests
    └── replit.test.ts         # Replit adapter tests
```

### Commands

```bash
# Install dependencies
pnpm install

# Start dev server (with HMR)
pnpm dev

# Run tests
pnpm test

# Type-check
pnpm typecheck

# Production build
pnpm build

# Preview build
pnpm preview
```

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage
```

### Local Development in Replit

1. Fork this repository
2. Import into Replit
3. Run `pnpm dev` in the Shell
4. The extension loads automatically in the Repl's sidebar

## Known Limitations

1. **CORS Dependency**: Requires `api.superdocs.app` to allow requests from `*.replit.dev` origins
2. **File Size Limits**: Replit workspace API limits reads to ~5MB and writes to ~2MB
3. **No Background Polling**: Polling runs in the panel; closing the panel stops long-running jobs
4. **Session Persistence**: SuperDocs session IDs stored in memory; page refresh loses session
5. **Single User**: Extension runs in the context of the current Replit user

## Acceptance Criteria

��� **First-Session UX**: Fresh Repl → select files → generate → edit → approve → export → save  
��� **Code Change Detection**: Modify code → click update → detect changes → regenerate → new doc reflects changes  
��� **Security**: No API keys in localStorage, git, or logs  
��� **Double-JSON Parse**: Handles SuperDocs `pending_changes` nested JSON correctly
