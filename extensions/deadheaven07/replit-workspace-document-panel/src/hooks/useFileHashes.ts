import { useState, useCallback } from 'react';
import { FileHashMap, detectChangedFiles, hasChanges, computeFileHashesAsync } from '../utils/hash';
import { usePersistedFileHashes } from './useStatePersistence';

export interface FileHashState {
  previousHashes: FileHashMap;
  currentHashes: FileHashMap;
  captureHashes: (files: Map<string, string>) => Promise<void>;
  updateCurrentHashes: (files: Map<string, string>) => Promise<void>;
  getChanges: () => { changed: string[]; added: string[]; removed: string[] };
  checkForChanges: () => boolean;
  reset: () => Promise<void>;
  getBaselineHashes: () => FileHashMap;
}

export function useFileHashes(): FileHashState {
  const { fileHashes: persistedHashes, setFileHashes } = usePersistedFileHashes();
  const [currentHashes, setCurrentHashes] = useState<FileHashMap>({});

  const captureHashes = useCallback(async (files: Map<string, string>) => {
    const hashes = await computeFileHashesAsync(files);
    setCurrentHashes(hashes);
    await setFileHashes(hashes);
  }, [setFileHashes]);

  const updateCurrentHashes = useCallback(async (files: Map<string, string>) => {
    const hashes = await computeFileHashesAsync(files);
    setCurrentHashes(hashes);
  }, []);

  const getChanges = useCallback(() => {
    return detectChangedFiles(persistedHashes, currentHashes);
  }, [persistedHashes, currentHashes]);

  const checkForChanges = useCallback(() => {
    return hasChanges(persistedHashes, currentHashes);
  }, [persistedHashes, currentHashes]);

  const reset = useCallback(async () => {
    setCurrentHashes({});
    await setFileHashes({});
  }, [setFileHashes]);

  const getBaselineHashes = useCallback(() => {
    return { ...persistedHashes };
  }, [persistedHashes]);

  return {
    previousHashes: persistedHashes,
    currentHashes,
    captureHashes,
    updateCurrentHashes,
    getChanges,
    checkForChanges,
    reset,
    getBaselineHashes,
  };
}