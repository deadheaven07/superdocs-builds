export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type FileHashMap = Record<string, string>;

export async function computeFileHashesAsync(files: Map<string, string>): Promise<FileHashMap> {
  const hashes: FileHashMap = {};
  for (const [path, content] of files) {
    hashes[path] = await sha256(content);
  }
  return hashes;
}

export function detectChangedFiles(
  previousHashes: FileHashMap,
  currentHashes: FileHashMap
): { changed: string[]; added: string[]; removed: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [path, hash] of Object.entries(currentHashes)) {
    if (!(path in previousHashes)) {
      added.push(path);
    } else if (previousHashes[path] !== hash) {
      changed.push(path);
    }
  }

  for (const path of Object.keys(previousHashes)) {
    if (!(path in currentHashes)) {
      removed.push(path);
    }
  }

  return { changed, added, removed };
}

export function hasChanges(previousHashes: FileHashMap, currentHashes: FileHashMap): boolean {
  const { changed, added, removed } = detectChangedFiles(previousHashes, currentHashes);
  return changed.length > 0 || added.length > 0 || removed.length > 0;
}