/// <reference lib="dom" />
import { useState, useEffect, useCallback, useRef } from 'react';
import { useReplit } from '@replit/extensions-react';
import { computeFileHashesAsync, FileHashMap } from '../utils/hash';

export interface FileChangeEvent {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  timestamp: number;
  previousHash?: string;
  currentHash?: string;
}

export interface CodeDeltaHash {
  hash: string;
  fileHashes: FileHashMap;
  lastComputed: number;
  changedFiles: string[];
}

export interface UseFileWatcherOptions {
  selectedPaths: string[];
  enabled: boolean;
  pollInterval?: number;
  onFileChange?: (event: FileChangeEvent) => void;
  onDeltaComputed?: (delta: CodeDeltaHash) => void;
}

export function useFileWatcher({
  selectedPaths,
  enabled,
  pollInterval = 2000,
  onFileChange,
  onDeltaComputed,
}: UseFileWatcherOptions) {
  const { replit } = useReplit();
  const [isWatching, setIsWatching] = useState(false);
  const [lastDelta, setLastDelta] = useState<CodeDeltaHash | null>(null);
  const [recentChanges, setRecentChanges] = useState<FileChangeEvent[]>([]);
  
  const previousHashesRef = useRef<FileHashMap>({});
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const computeDeltaHash = useCallback(async (files: Map<string, string>): Promise<CodeDeltaHash> => {
    const hashes = await computeFileHashesAsync(files);
    const changedFiles: string[] = [];
    
    for (const [path, hash] of Object.entries(hashes)) {
      if (previousHashesRef.current[path] !== hash) {
        changedFiles.push(path);
      }
    }
    
    // Create a combined hash of all file hashes for the delta hash
    const sortedEntries = Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b));
    const combinedString = sortedEntries.map(([path, hash]) => `${path}:${hash}`).join('|');
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(combinedString));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const deltaHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    previousHashesRef.current = hashes;
    
    return {
      hash: deltaHash,
      fileHashes: hashes,
      lastComputed: Date.now(),
      changedFiles,
    };
  }, []);

  const scanFiles = useCallback(async () => {
    if (!replit || !enabled || selectedPaths.length === 0) return;
    
    try {
      const files = new Map<string, string>();
      
      for (const path of selectedPaths) {
        try {
          const result = await replit.fs.readFile(path, 'utf8');
          if (!('error' in result) && result.content !== undefined) {
            files.set(path, result.content);
          }
        } catch {
          // File might have been deleted
        }
      }
      
      if (files.size > 0) {
        const delta = await computeDeltaHash(files);
        setLastDelta(delta);
        if (onDeltaComputed) onDeltaComputed(delta);
        
        // Check for individual file changes
        if (delta.changedFiles.length > 0) {
          const changes: FileChangeEvent[] = delta.changedFiles.map(path => ({
            path,
            type: 'modified' as const,
            timestamp: Date.now(),
            previousHash: previousHashesRef.current[path],
            currentHash: delta.fileHashes[path],
          }));
          
          setRecentChanges(prev => [...changes, ...prev].slice(0, 50));
          if (onFileChange) {
            changes.forEach(c => onFileChange(c));
          }
        }
      }
    } catch (error) {
      console.warn('[FileWatcher] Scan error:', error);
    }
  }, [replit, enabled, selectedPaths, computeDeltaHash, onDeltaComputed, onFileChange]);

  const startWatching = useCallback(() => {
    if (!enabled || isWatching) return;
    
    setIsWatching(true);
    mountedRef.current = true;
    
    // Initial scan
    scanFiles();
    
    // Poll for changes
    pollTimerRef.current = setInterval(() => {
      if (mountedRef.current) {
        scanFiles();
      }
    }, pollInterval);
  }, [enabled, isWatching, scanFiles, pollInterval]);

  const stopWatching = useCallback(() => {
    setIsWatching(false);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    mountedRef.current = false;
  }, []);

  const reset = useCallback(() => {
    previousHashesRef.current = {};
    setLastDelta(null);
    setRecentChanges([]);
  }, []);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    if (enabled) {
      startWatching();
    } else {
      stopWatching();
    }
    
    return () => {
      stopWatching();
    };
  }, [enabled, startWatching, stopWatching]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  return {
    isWatching,
    lastDelta,
    recentChanges,
    startWatching,
    stopWatching,
    reset,
    scanFiles,
  };
}