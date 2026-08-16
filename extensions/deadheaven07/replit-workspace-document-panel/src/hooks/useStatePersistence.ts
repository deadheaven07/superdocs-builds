/// <reference lib="dom" />
import { useState, useEffect, useCallback } from 'react';
import { writeArtifactToWorkspace, readProjectFile } from '../services/replit';
import { FileHashMap } from '../utils/hash';

const STATE_FILE_PATH = '.superdocs-state.json';
const LOCALSTORAGE_KEY = 'superdocs-replit-state';

export interface PersistedState {
  sessionId?: string;
  documentId?: string;
  documentType?: 'readme' | 'spec' | 'user-guide';
  selectedPaths: string[];
  fileHashes: FileHashMap;
  originalInstruction?: string;
  lastUpdated: number;
  version: number;
}

const DEFAULT_STATE: PersistedState = {
  selectedPaths: [],
  fileHashes: {},
  lastUpdated: Date.now(),
  version: 1,
};

function isValidState(state: unknown): state is PersistedState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'version' in state &&
    typeof (state as Record<string, unknown>).version === 'number' &&
    'selectedPaths' in state &&
    Array.isArray((state as Record<string, unknown>).selectedPaths) &&
    'fileHashes' in state &&
    typeof (state as Record<string, unknown>).fileHashes === 'object'
  );
}

async function loadFromWorkspace(): Promise<PersistedState | null> {
  try {
    const content = await readProjectFile(STATE_FILE_PATH);
    if (!content) return null;
    const parsed = JSON.parse(content);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadFromLocalStorage(): PersistedState | null {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveToWorkspace(state: PersistedState): Promise<void> {
  try {
    const content = JSON.stringify(state, null, 2);
    await writeArtifactToWorkspace(STATE_FILE_PATH, content);
  } catch (error) {
    console.warn('Failed to save state to workspace:', error);
  }
}

function saveToLocalStorage(state: PersistedState): void {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save state to localStorage:', error);
  }
}

export function useStatePersistence(): [
  PersistedState,
  (partial: Partial<PersistedState>) => Promise<void>,
  () => Promise<void>
] {
  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const workspaceState = await loadFromWorkspace();
      const localState = loadFromLocalStorage();

      let mergedState = DEFAULT_STATE;

      if (workspaceState && localState) {
        mergedState = workspaceState.lastUpdated >= localState.lastUpdated ? workspaceState : localState;
      } else if (workspaceState) {
        mergedState = workspaceState;
      } else if (localState) {
        mergedState = localState;
      }

      if (mounted) {
        setState(mergedState);
        setLoaded(true);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const updateState = useCallback(async (partial: Partial<PersistedState>): Promise<void> => {
    setState(prev => {
      const newState = {
        ...prev,
        ...partial,
        lastUpdated: Date.now(),
      };
      saveToLocalStorage(newState);
      saveToWorkspace(newState).catch(console.warn);
      return newState;
    });
  }, []);

  const clearState = useCallback(async (): Promise<void> => {
    const cleared = { ...DEFAULT_STATE, lastUpdated: Date.now() };
    setState(cleared);
    saveToLocalStorage(cleared);
    await saveToWorkspace(cleared);
  }, []);

  return [state, updateState, clearState];
}

export function usePersistedSelection(): [
  string[],
  (paths: string[]) => Promise<void>
] {
  const [state, updateState] = useStatePersistence();

  const setSelectedPaths = useCallback(async (paths: string[]): Promise<void> => {
    await updateState({ selectedPaths: paths });
  }, [updateState]);

  return [state.selectedPaths, setSelectedPaths];
}

export function usePersistedHashes(): [
  FileHashMap,
  (hashes: FileHashMap) => Promise<void>
] {
  const [state, updateState] = useStatePersistence();

  const setFileHashes = useCallback(async (hashes: FileHashMap): Promise<void> => {
    await updateState({ fileHashes: hashes });
  }, [updateState]);

  return [state.fileHashes, setFileHashes];
}

export function usePersistedSession(): [
  { sessionId?: string; documentId?: string; documentType?: 'readme' | 'spec' | 'user-guide'; originalInstruction?: string },
  (partial: { sessionId?: string; documentId?: string; documentType?: 'readme' | 'spec' | 'user-guide'; originalInstruction?: string }) => Promise<void>
] {
  const [state, updateState] = useStatePersistence();

  const setSession = useCallback(async (partial: {
    sessionId?: string;
    documentId?: string;
    documentType?: 'readme' | 'spec' | 'user-guide';
    originalInstruction?: string;
  }): Promise<void> => {
    await updateState(partial);
  }, [updateState]);

  return [
    {
      sessionId: state.sessionId,
      documentId: state.documentId,
      documentType: state.documentType,
      originalInstruction: state.originalInstruction,
    },
    setSession,
  ];
}