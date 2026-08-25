# SuperDocs Replit Workspace Document Panel — Architecture Document

## Overview

This document describes the technical architecture of the **SuperDocs Replit Workspace Document Panel** (Task 2.2) — a React + TypeScript Replit extension built on `@replit/extensions` that enables developers to ingest workspace context, generate structured documentation via SuperDocs AI, cherry-pick granular diffs, and export publication-ready documents directly into their Repl filesystem.

---

## Visual Architecture & Interface States

### 1. Workspace Ingestion & Theme Architecture
![Dark Workspace File Tree](docs/screenshots/01_dark_workspace_filetree.png)

### 2. Zero-Disk API Key Security Modal (`modal pop`)
![API Key Modal Pop](docs/screenshots/02_api_key_modal_pop.png)

### 3. Human-in-the-Loop Cherry-Pick Diff Review
![Granular Cherry Pick Review](docs/screenshots/03_cherry_pick_review.png)

### 4. Telemetry & Workspace Side Drawer
![Side Drawer Overview](docs/screenshots/04_side_drawer_overview.png)

### 5. Template Recipes & Parameter Injection
![Template Gallery & Variables](docs/screenshots/05_template_gallery_variables.png)

### 6. Version History & Rollback Timeline
![Version History Rollback](docs/screenshots/06_version_history_rollback.png)

---

## Layered System Architecture

```mermaid
graph TD
    subgraph UI_Layer ["UI Layer (React 18 + Tailwind CSS)"]
        DP[DocumentPanel Orchestrator]
        FT[FileTree Component]
        DT[DraftTab Component]
        RT[ReviewTab Cherry-Pick Diffs]
        ET[ExportTab PDF/DOCX]
        HT[HistoryTab SuperDocs v2]
        TG[TemplateGallery & Prompt Forms]
        SD[Collapsible Side Drawer]
        SB[StatusBadge Telemetry]
    end

    subgraph Hooks_Layer ["Hooks & State Management"]
        USD[useSuperDocs State Machine]
        UFH[useFileHashes Zero-Drift Engine]
        USP[useStatePersistence Layer]
        UWF[useWorkspaceFiles Replit API]
    end

    subgraph Service_Layer ["Service Layer"]
        SC[superdocs.ts REST Client]
        RC[replit.ts Context Harvester]
        CC[context.ts Context Formatter]
        RV[revision.ts Diff & Patch Engine]
        HL[headless.ts Machine Runner]
    end

    subgraph External_Runtime ["External Runtime & APIs"]
        RPL["Replit Extensions RPC (Comlink / @replit/extensions)"]
        SDA["SuperDocs Cloud REST API (api.superdocs.app)"]
        RFS["Replit Virtual Filesystem (replit.fs)"]
    end

    DP --> USD
    DP --> UFH
    DP --> USP
    DP --> UWF

    USD --> SC
    UFH --> RV
    UWF --> RPL
    UWF --> RFS
    SC --> SDA
    RC --> UWF
```

---

## Key Subsystems & Design Patterns

### 1. Dual-Layer Theme Architecture
- **Tokens**: Pure CSS variables (`--bg-app`, `--bg-card`, `--text-main`, `--border-app`, `--shadow-pop`).
- **Dark Mode (Default)**: Deep Linear/Replit slate (`#0e1525` background, `#151d2f` cards, `#28334e` borders).
- **Light Mode**: High-contrast slate and crisp indigo surfaces.
- **Micro-Animations**: Keyframe physics for `@keyframes modalPop` (spring entrance) and `@keyframes drawerSlide` (slide-out panel).

### 2. Zero-Drift Source Regeneration Pipeline
```
Workspace Files → SHA-256 Hashes Computed → Compared with Stored Baseline
       │
       ├── If Hash Unchanged: Short-circuits (0 API calls, 0 token burns)
       └── If Hash Modified: Thin diff payload dispatched to SuperDocs Cloud
```

### 3. Double-JSON Parser & Resilient Deserialization
SuperDocs returns nested `pending_changes` payloads in double-encoded JSON format. The custom `parser.ts` safely parses both single-level objects and stringified JSON blobs:
```typescript
export function parsePendingChanges(raw: unknown): ProposedChange[] {
  // Handles stringified JSON inside outer metadata container
  let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed?.content && typeof parsed.content === 'string') {
    parsed = JSON.parse(parsed.content);
  }
  return parsed?.changes || [];
}
```

### 4. Human-in-the-Loop Cherry-Pick Diff Review
Instead of all-or-nothing approvals, `ReviewTab.tsx` empowers developers to:
- Inspect granular operations: `replace`, `insert`, and `delete`.
- Select/deselect individual change items.
- Dispatch targeted approval payloads (`approved_ids: string[]`) to SuperDocs Cloud.

### 5. Zero-Persistence API Key Security
- API key resides exclusively in memory (`React.useState`).
- Never committed to disk, `.env`, `.superdocs-state.json`, or browser `localStorage`.

---

## Verification & Testing Suite

### Headed Playwright E2E Architecture
Simulates a real Replit IDE container using `replit-host.html` and Comlink RPC:

| Spec Name | Scope | Runtime |
| :--- | :--- | :--- |
| `Complete 10-Step User Workflow` | Ingestion → API Key Modal → Draft → Double-JSON Review → Cherry-Pick → PDF Export to Replit FS | 2.0s |
| `UI/UX: Theme & Side Drawer` | Dark/Light switching, slide-out drawer inspection, live drift metrics | 1.6s |
| `Templates Gallery & Variables` | Recipe browsing, parameter injection, form binding, markdown preview | 1.5s |
| `Version History & Rollback` | Snapshot chronological timeline, HTML preview, revert button check | 1.5s |

### Vitest Unit & Integration Matrix
- **11 Test Suites**: 101 unit tests testing hash integrity, context builders, revision engines, headless runners, and persistence layers.
- **Execution Time**: 1.02s across all 101 tests.

---

## Directory Structure

```
extensions/deadheaven07/replit-workspace-document-panel/
├── docs/
│   └── screenshots/              # High-resolution UI captures
│       ├── 01_dark_workspace_filetree.png
│       ├── 02_api_key_modal_pop.png
│       ├── 03_cherry_pick_review.png
│       ├── 04_side_drawer_overview.png
│       ├── 05_template_gallery_variables.png
│       ├── 06_version_history_rollback.png
│       └── 07_light_theme_mode.png
├── e2e/
│   ├── replit_document_panel.spec.ts  # 4 Playwright E2E specs
│   └── capture_screenshots.spec.ts    # Automated screenshot generator
├── src/
│   ├── components/               # React UI components
│   ├── hooks/                    # Custom React hooks
│   ├── services/                 # REST & FS services
│   ├── styles/                   # Modern CSS variables & animations
│   ├── types/                    # TypeScript interfaces
│   └── utils/                    # Hashing & parser utilities
├── tests/                        # 101 Vitest unit tests
├── replit-host.html              # Replit Extension host simulator
└── package.json
```