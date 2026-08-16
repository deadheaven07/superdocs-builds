import { FileHashMap, computeFileHashesAsync, detectChangedFiles } from '../utils/hash';

export type DocumentType = 'readme' | 'spec' | 'user-guide';

export interface ChangedFile {
  path: string;
  content: string;
}

export interface SourceDiff {
  /** Files whose content changed since the baseline, with their CURRENT content. */
  changed: ChangedFile[];
  /** Files that exist now but were not in the baseline. */
  added: string[];
  /** Files in the baseline that no longer exist. */
  removed: string[];
  hasChanges: boolean;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  readme: 'README.md',
  spec: 'SPEC.md',
  'user-guide': 'USER_GUIDE.md',
};

/**
 * Compute the source diff between a persisted hash baseline and the current
 * file contents. Only the changed/added/removed file paths are returned;
 * unchanged files produce NO output, which is what guarantees previously
 * approved sections whose source files are untouched are never re-proposed.
 *
 * Paths are sorted so the derived instruction is deterministic (byte-identical
 * for identical inputs regardless of read order).
 */
export async function computeSourceDiff(
  baselineHashes: FileHashMap,
  currentFiles: Map<string, string>
): Promise<SourceDiff> {
  const currentHashes = await computeFileHashesAsync(currentFiles);
  const { changed, added, removed } = detectChangedFiles(baselineHashes, currentHashes);

  return {
    changed: changed
      .map(path => ({ path, content: currentFiles.get(path) ?? '' }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    added: [...added].sort(),
    removed: [...removed].sort(),
    hasChanges: changed.length > 0 || added.length > 0 || removed.length > 0,
  };
}

/**
 * Build the chat instruction for a regeneration. The message contains ONLY:
 *   1. the stable original user instruction (never the previous generated prompt),
 *   2. the list of changed/added/removed files,
 *   3. the full current content of the CHANGED files only.
 *
 * Unchanged files are omitted entirely, so the model is constrained to
 * granular edits on the affected sections and cannot drift unrelated content.
 */
export function buildRevisionMessage(
  documentType: DocumentType,
  originalInstruction: string,
  diff: SourceDiff
): string {
  const label = DOCUMENT_LABELS[documentType] || DOCUMENT_LABELS.readme;

  const sections: string[] = [];

  if (diff.changed.length > 0) {
    sections.push(`## Modified Files (${diff.changed.length})\n\n${diff.changed.map(f => `- \`${f.path}\``).join('\n')}`);
  }
  if (diff.added.length > 0) {
    sections.push(`## Added Files (${diff.added.length})\n\n${diff.added.map(p => `- \`${p}\``).join('\n')}`);
  }
  if (diff.removed.length > 0) {
    sections.push(`## Removed Files (${diff.removed.length})\n\n${diff.removed.map(p => `- \`${p}\``).join('\n')}`);
  }

  const fileContents = diff.changed
    .map(f => `## File: \`${f.path}\`\n\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n---\n\n');

  return `${originalInstruction}

---

## Code Changes Detected

The following source files have changed since the last document generation:

${sections.join('\n\n')}

---

## Changed File Contents (current)

${fileContents}

---

Please update the ${label} to reflect ONLY the changes listed above. Focus on:
- Updated API endpoints, function signatures, or interfaces
- New features or configuration options
- Removed or deprecated functionality
- Changes to installation, usage, or configuration steps

Do not modify sections of the document whose source files are unchanged.`;
}

export interface RegenerationPlan {
  hasChanges: boolean;
  diff: SourceDiff;
  /**
   * Present only when `hasChanges` is true. When the source is unchanged the
   * plan short-circuits here with no message and no chat job is created —
   * the proposed-changes list is provably empty (zero drift).
   */
  message?: string;
}

export async function planRegeneration(
  baselineHashes: FileHashMap,
  currentFiles: Map<string, string>,
  documentType: DocumentType,
  originalInstruction: string
): Promise<RegenerationPlan> {
  const diff = await computeSourceDiff(baselineHashes, currentFiles);
  if (!diff.hasChanges) {
    return { hasChanges: false, diff };
  }
  return {
    hasChanges: true,
    diff,
    message: buildRevisionMessage(documentType, originalInstruction, diff),
  };
}