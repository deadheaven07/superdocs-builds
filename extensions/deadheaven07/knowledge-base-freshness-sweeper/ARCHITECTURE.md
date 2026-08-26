# Architecture Specification: Knowledge-base Freshness Sweeper

This document outlines the architectural decisions, data flow, trust boundaries, and technical guarantees for the **Knowledge-base Freshness Sweeper** (Task 2.3).

---

## 1. Domain Entities & State Lifecycle

```
[ChangeEvent]
      │
      ▼
[Assessment] ──(if AFFECTED)──> [EditProposal] ──(Human Review)──> [Approved / Rejected]
      │                                                                  │
      ▼                                                                  ▼
[PortfolioMetrics] <────────────────────────────────────────── [Article Content Patch]
```

### State Definitions
1. **Article**:
   - `id`: Immutable unique identifier.
   - `content`: Markdown text.
   - `version`: Monotonically increasing revision integer (bumped on proposal approval).
   - `screenshots`: Attached images with OCR labels.
2. **Assessment**:
   - `status`: `AFFECTED` | `NOT_AFFECTED` | `COULD_NOT_ASSESS`.
   - `confidence`: `HIGH` | `MEDIUM` | `LOW`.
   - `evidence`: List of verified verbatim sentence quotes with character offsets.
   - `could_not_assess_details`: Transparent disclosure of missing evidence and checked terms.
3. **EditProposal**:
   - `status`: `PENDING` | `APPROVED` | `REJECTED`.
   - `changed_spans`: Exact start and end offsets of mutated sentences.
   - `structural_preservation_ratio`: Ratio of unmodified characters to total characters ($\ge 98.9\%$).

---

## 2. Multi-Stage Impact Discovery Pipeline

| Stage | Subsystem | Responsibility | Failure Mode / Fallback |
|---|---|---|---|
| **0** | `extractSentences` | Splits content into sentences while preserving offsets and headings | Standard punctuation regex fallback |
| **1** | `matchDeterministic` | Matches exact entity names, numbers, UI labels, and paths | Continues to Stage 2 |
| **2** | `matchSemantic` | Identifies indirect workflow descriptions and semantic overlap; filters false-positive traps | Ignored if no corroborated clues |
| **3** | `extractEvidence` | Verifies verbatim quote presence in article markdown | If quote missing, rejects match |
| **4** | `classifyAssessment` | Classifies confidence; catches ambiguous scopes and flags `COULD_NOT_ASSESS` | Low confidence $\to$ `COULD_NOT_ASSESS` |

---

## 3. Structural Preservation Guarantees

The AST Markdown Patcher enforces the following invariant:

$$\forall \text{ proposal } P, \quad \text{Preservation}(P) \ge 95\% \quad \land \quad \Delta(\text{Headings}) = 0 \quad \land \quad \Delta(\text{CodeBlocks}) = 0$$

- Headings (`# Header`), bullet lists (`- item`), code fences (` ``` `), and hyperlinks (`[label](url)`) outside the target sentence are guaranteed to remain bit-for-bit identical.

---

## 4. Trust Boundaries & Human-in-the-Loop

```
[System Proposed Change] ──> [Pending Proposal] ──> [Human Reviewer Action]
                                                           │
                                        ┌──────────────────┴──────────────────┐
                                        ▼                                     ▼
                                   [Approve]                               [Reject]
                                        │                                     │
                             - Apply sentence patch               - Retain original article
                             - Bump version number                - Record rejection notes
                             - Recalculate Freshness              - Keep proposal as REJECTED
```

The system **never** applies unapproved changes autonomously to production documentation.

---

## 5. Budget Guard & Cost Accounting

Pre-flight cost estimation ensures that batch runs cannot accidentally incur runaway model charges:
$$\text{Tokens} = \lceil \text{Characters} / 4 \rceil$$
$$\text{Cost} = \frac{\text{Input Tokens}}{1000} \times C_{\text{in}} + \frac{\text{Output Tokens}}{1000} \times C_{\text{out}}$$
If $\text{Cost} > \text{Budget Cap}$, execution is aborted immediately before any inference calls are made.
