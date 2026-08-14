import { useState, useCallback } from 'react';
import { FileHashMap, detectChangedFiles, hasChanges, computeFileHashesAsync } from '../utils/hash';

export function useFileHashes() {
  const [previousHashes, setPreviousHashes] = useState<FileHashMap>({});
  const [currentHashes, setCurrentHashes] = useState<FileHashMap>({});

  const captureHashes = useCallback(async (files: Map<string, string>) => {
    const hashes = await computeFileHashesAsync(files);
    setCurrentHashes(hashes);
    setPreviousHashes(hashes);
  }, []);

  const updateCurrentHashes = useCallback(async (files: Map<string, string>) => {
    const hashes = await computeFileHashesAsync(files);
    setCurrentHashes(hashes);
  }, []);

  const getChanges = useCallback(() => {
    return detectChangedFiles(previousHashes, currentHashes);
  }, [previousHashes, currentHashes]);

  const checkForChanges = useCallback(() => {
    return hasChanges(previousHashes, currentHashes);
  }, [previousHashes, currentHashes]);

  const reset = useCallback(() => {
    setPreviousHashes({});
    setCurrentHashes({});
  }, []);

  return {
    previousHashes,
    currentHashes,
    captureHashes,
    updateCurrentHashes,
    getChanges,
    checkForChanges,
    reset,
  };
}