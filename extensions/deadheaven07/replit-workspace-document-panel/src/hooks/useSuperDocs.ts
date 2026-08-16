import { useState, useCallback, useMemo, useRef } from 'react';
import { createSuperDocsClient } from '../services/superdocs';
import { parseProposedChangeBatch } from '../utils/parser';
import { DocumentUploadResult, ProposedChange, ExportResult, ProposedChangeBatch, JobStatus, SurgicalEditInstruction, FileConflict, ConflictCheckResult } from '../types/superdocs';

export type { SurgicalEditInstruction };

export type GenerationStep = 
  | 'idle'
  | 'uploading'
  | 'generating'
  | 'polling'
  | 'awaiting_approval'
  | 'approving'
  | 'exporting'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'conflict_check'
  | 'conflict_resolution';

export interface SuperDocsState {
  step: GenerationStep;
  sessionId?: string;
  documentId?: string;
  jobId?: string;
  uploadResult?: DocumentUploadResult;
  proposedChanges?: ProposedChangeBatch;
  exportResult?: ExportResult;
  error?: string;
  progress?: string;
  canRetry?: boolean;
  lastInstruction?: string;
  lastDocumentType?: string;
  isSurgicalEdit?: boolean;
  conflictCheckResult?: ConflictCheckResult;
  conflictResolution?: {
    active: boolean;
    conflicts: FileConflict[];
  };
}

export interface SuperDocsActions {
  generateDocument: (instruction: string, documentType: string) => Promise<void>;
  requestSurgicalEdits: (instruction: SurgicalEditInstruction, baselineHashes: Record<string, string>, readFileFn: (path: string) => Promise<string | null>) => Promise<void>;
  approveChanges: (approved: boolean, changes: ProposedChange[]) => Promise<void>;
  continueJob: (continueJob: boolean) => Promise<void>;
  exportDocument: (format: 'pdf' | 'docx') => Promise<Blob>;
  cancel: () => void;
  retry: () => void;
  dismissError: () => void;
  reset: () => void;
  resolveConflict: (action: { type: 'overwrite_ai' | 'keep_local' | 'abort'; conflictPath: string }) => Promise<void>;
  skipConflictCheck: () => Promise<void>;
  restoreSession: (sessionData: { sessionId: string; documentId: string; documentType: string; proposedChanges?: ProposedChangeBatch; jobId?: string; jobStatus?: JobStatus }) => void;
}

function computeDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);
  const diffLines: string[] = [];
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine === newLine) {
      if (oldLine !== undefined) diffLines.push(`  ${oldLine}`);
    } else {
      if (oldLine !== undefined) diffLines.push(`- ${oldLine}`);
      if (newLine !== undefined) diffLines.push(`+ ${newLine}`);
    }
  }
  
  return diffLines.slice(0, 50).join('\n');
}

export function useSuperDocs(apiKey: string): [SuperDocsState, SuperDocsActions] {
  const [state, setState] = useState<SuperDocsState>({ step: 'idle' });
  const client = useMemo(() => createSuperDocsClient(apiKey), [apiKey]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingSurgicalInstructionRef = useRef<SurgicalEditInstruction | null>(null);
  const pendingBaselineHashesRef = useRef<Record<string, string>>({});
  const pendingReadFileFnRef = useRef<((path: string) => Promise<string | null>) | null>(null);

  const reset = useCallback(() => {
    setState({ step: 'idle' });
    pendingSurgicalInstructionRef.current = null;
    pendingBaselineHashesRef.current = {};
    pendingReadFileFnRef.current = null;
  }, []);

  const updateStep = useCallback((step: GenerationStep, progress?: string) => {
    setState(prev => ({ ...prev, step, progress, error: undefined, canRetry: false }));
  }, []);

  const setError = useCallback((error: string, canRetry = false) => {
    setState(prev => ({ ...prev, step: 'failed', error, canRetry, lastInstruction: prev.lastInstruction, lastDocumentType: prev.lastDocumentType }));
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setState(prev => ({ ...prev, step: 'idle', error: undefined, progress: undefined }));
  }, []);

  const dismissError = useCallback(() => {
    setState(prev => ({ ...prev, step: 'idle', error: undefined, canRetry: false }));
  }, []);

  const restoreSession = useCallback((sessionData: { sessionId: string; documentId: string; documentType: string; proposedChanges?: ProposedChangeBatch; jobId?: string; jobStatus?: JobStatus }) => {
    setState(prev => ({
      ...prev,
      sessionId: sessionData.sessionId,
      documentId: sessionData.documentId,
      lastDocumentType: sessionData.documentType,
      proposedChanges: sessionData.proposedChanges,
      jobId: sessionData.jobId,
      step: sessionData.proposedChanges ? 'awaiting_approval' : (sessionData.jobId ? 'polling' : 'completed'),
    }));
  }, []);

  const generateDocument = useCallback(async (instruction: string, documentType: string) => {
    if (!apiKey) { setError('SuperDocs API key is required', true); return; }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setState(prev => ({ ...prev, lastInstruction: instruction, lastDocumentType: documentType, isSurgicalEdit: false }));

    try {
      updateStep('uploading', 'Uploading document to SuperDocs...');
      const filename = `${documentType.toUpperCase()}.md`;
      const uploadResult = await client.uploadDocument(filename, instruction, undefined, true, signal);
      if (signal.aborted) return;

      setState(prev => ({ ...prev, sessionId: uploadResult.session_id, documentId: uploadResult.document_id, uploadResult }));
      updateStep('generating', 'Starting document generation...');
      
      const jobId = await client.chatAsync({
        message: instruction,
        session_id: uploadResult.session_id,
        approval_mode: 'ask_every_time',
        model_tier: 'core',
      }, signal);
      if (signal.aborted) return;

      setState(prev => ({ ...prev, jobId }));
      updateStep('polling', 'Waiting for SuperDocs to process...');
      
      const jobStatus = await client.waitForJob(jobId, (status) => {
        if (signal.aborted) return;
        updateStep('polling', `Processing... (${status.status})`);
      }, signal);
      if (signal.aborted) return;

      setState(prev => ({ ...prev, jobId: jobStatus.job_id }));
      
      if (jobStatus.status === 'failed') throw new Error(jobStatus.error || 'Job failed');
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string' ? metadata.pending_changes : JSON.stringify(metadata.pending_changes)
          );
          setState(prev => ({ ...prev, proposedChanges }));
          updateStep('awaiting_approval', `${proposedChanges.changes.length} proposed changes awaiting review`);
        } else {
          updateStep('awaiting_approval', 'Awaiting approval (no changes parsed)');
        }
      } else if (jobStatus.status === 'completed') {
        updateStep('completed', 'Document generation completed');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setError(error instanceof Error ? error.message : 'Unknown error', true);
    }
  }, [apiKey, client, updateStep, setError]);

  const performConflictCheck = useCallback(async (
    instruction: SurgicalEditInstruction,
    baselineHashes: Record<string, string>,
    readFileFn: (path: string) => Promise<string | null>
  ): Promise<ConflictCheckResult> => {
    const conflicts: FileConflict[] = [];
    const checkedFiles: string[] = [];

    const filesToCheck = [
      ...instruction.changedFiles.map(f => f.path),
      ...instruction.addedFiles.map(f => f.path),
      ...instruction.removedFiles,
    ];

    for (const path of filesToCheck) {
      checkedFiles.push(path);
      const baselineHash = baselineHashes[path];
      if (!baselineHash) continue;

      const currentContent = await readFileFn(path);
      if (currentContent === null) {
        const baselineContent = instruction.changedFiles.find(f => f.path === path)?.oldContent || '';
        if (baselineContent) {
          conflicts.push({ path, baselineHash, currentHash: 'deleted', baselineContent, currentContent: '', diff: `File was deleted locally\n\nBaseline content:\n${baselineContent.slice(0, 500)}` });
        }
        continue;
      }

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(currentContent));
      const currentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      if (currentHash !== baselineHash) {
        const baselineContent = instruction.changedFiles.find(f => f.path === path)?.oldContent || '';
        conflicts.push({ path, baselineHash, currentHash, baselineContent, currentContent, diff: computeDiff(baselineContent, currentContent) });
      }
    }

    return { hasConflicts: conflicts.length > 0, conflicts, checkedFiles };
  }, []);

  const requestSurgicalEdits = useCallback(async (
    instruction: SurgicalEditInstruction,
    baselineHashes: Record<string, string>,
    readFileFn: (path: string) => Promise<string | null>
  ) => {
    const { sessionId } = state;
    if (!sessionId) { setError('No active SuperDocs session for surgical edits', true); return; }
    if (!apiKey) { setError('SuperDocs API key is required', true); return; }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    pendingSurgicalInstructionRef.current = instruction;
    pendingBaselineHashesRef.current = baselineHashes;
    pendingReadFileFnRef.current = readFileFn;

    setState(prev => ({ ...prev, isSurgicalEdit: true, lastInstruction: JSON.stringify(instruction) }));

    try {
      updateStep('conflict_check', 'Checking for local file modifications...');
      const conflictResult = await performConflictCheck(instruction, baselineHashes, readFileFn);
      if (signal.aborted) return;

      if (conflictResult.hasConflicts) {
        setState(prev => ({
          ...prev,
          conflictCheckResult: conflictResult,
          conflictResolution: { active: true, conflicts: conflictResult.conflicts },
          step: 'conflict_resolution',
        }));
        updateStep('conflict_resolution', `${conflictResult.conflicts.length} file(s) modified locally - resolution required`);
        return;
      }

      updateStep('generating', 'Requesting surgical edits from SuperDocs...');
      const jobId = await client.requestSurgicalEdits(sessionId, instruction, signal);
      if (signal.aborted) return;

      setState(prev => ({ ...prev, jobId }));
      updateStep('polling', 'Waiting for SuperDocs to process surgical edits...');
      
      const jobStatus = await client.waitForJob(jobId, (status) => {
        if (signal.aborted) return;
        updateStep('polling', `Processing surgical edits... (${status.status})`);
      }, signal);
      if (signal.aborted) return;

      setState(prev => ({ ...prev, jobId: jobStatus.job_id }));
      
      if (jobStatus.status === 'failed') throw new Error(jobStatus.error || 'Surgical edit job failed');
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string' ? metadata.pending_changes : JSON.stringify(metadata.pending_changes)
          );
          setState(prev => ({ ...prev, proposedChanges }));
          updateStep('awaiting_approval', `${proposedChanges.changes.length} surgical edits awaiting review`);
        } else {
          updateStep('awaiting_approval', 'Awaiting approval (no changes parsed)');
        }
      } else if (jobStatus.status === 'completed') {
        updateStep('completed', 'Surgical edits applied successfully');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setError(error instanceof Error ? error.message : 'Unknown error', true);
    }
  }, [apiKey, client, state.sessionId, updateStep, setError, performConflictCheck]);

  const resolveConflict = useCallback(async (action: { type: 'overwrite_ai' | 'keep_local' | 'abort'; conflictPath: string }) => {
    const { conflictResolution, conflictCheckResult } = state;
    if (!conflictResolution || !conflictCheckResult) return;

    if (action.type === 'abort') {
      setState(prev => ({ ...prev, step: 'idle', conflictResolution: { ...prev.conflictResolution!, active: false }, conflictCheckResult: undefined }));
      return;
    }

    const updatedConflicts = conflictResolution.conflicts.map((c: FileConflict) => 
      c.path === action.conflictPath ? { ...c, resolved: true, resolution: action.type } : c
    );

    const allResolved = updatedConflicts.every((c: FileConflict) => c.resolved);
    
    setState(prev => ({
      ...prev,
      conflictResolution: { ...prev.conflictResolution!, conflicts: updatedConflicts, active: !allResolved },
    }));

    if (allResolved) {
      const instruction = pendingSurgicalInstructionRef.current;
      const baselineHashes = pendingBaselineHashesRef.current;
      const readFileFn = pendingReadFileFnRef.current;
      
      if (instruction && readFileFn) {
        const filteredInstruction: SurgicalEditInstruction = {
          ...instruction,
          changedFiles: instruction.changedFiles.map((f: { path: string; oldContent?: string; newContent: string }) => {
            const conflict = conflictCheckResult.conflicts.find((c: FileConflict) => c.path === f.path);
            if (conflict?.resolution === 'keep_local') return { ...f, newContent: conflict.currentContent };
            return f;
          }),
          addedFiles: instruction.addedFiles.filter((f: { path: string; content: string }) => {
            const conflict = conflictCheckResult.conflicts.find((c: FileConflict) => c.path === f.path);
            return conflict?.resolution !== 'keep_local';
          }),
          removedFiles: instruction.removedFiles.filter((f: string) => {
            const conflict = conflictCheckResult.conflicts.find((c: FileConflict) => c.path === f);
            return conflict?.resolution !== 'keep_local';
          }),
        };

        await requestSurgicalEdits(filteredInstruction, baselineHashes, readFileFn);
      }
    }
  }, [state.conflictResolution, state.conflictCheckResult, requestSurgicalEdits]);

  const skipConflictCheck = useCallback(async () => {
    const instruction = pendingSurgicalInstructionRef.current;
    const baselineHashes = pendingBaselineHashesRef.current;
    const readFileFn = pendingReadFileFnRef.current;
    
    if (instruction && readFileFn) {
      setState(prev => ({ ...prev, conflictResolution: { ...prev.conflictResolution!, active: false }, conflictCheckResult: undefined }));
      await requestSurgicalEdits(instruction, baselineHashes, readFileFn);
    }
  }, [requestSurgicalEdits]);

  const retry = useCallback(() => {
    const { lastInstruction, lastDocumentType, isSurgicalEdit } = state;
    if (lastInstruction && lastDocumentType) {
      if (isSurgicalEdit) {
        try {
          const instruction = JSON.parse(lastInstruction) as SurgicalEditInstruction;
          const baselineHashes = pendingBaselineHashesRef.current;
          const readFileFn = pendingReadFileFnRef.current;
          if (readFileFn) requestSurgicalEdits(instruction, baselineHashes, readFileFn);
        } catch { setError('Failed to parse surgical edit instruction for retry', true); }
      } else {
        generateDocument(lastInstruction, lastDocumentType);
      }
    }
  }, [state, generateDocument, requestSurgicalEdits, setError]);

  const approveChanges = useCallback(async (approved: boolean, changes: ProposedChange[]) => {
    const { sessionId, jobId } = state;
    if (!sessionId || !jobId) { setError('Missing session or job ID'); return; }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      const step = approved ? 'approving' : 'polling';
      const progress = approved ? 'Applying approved surgical edits...' : 'Rejecting changes and continuing...';
      updateStep(step, progress);
      
      const jobStatus = await client.approveChanges({ session_id: sessionId, job_id: jobId, approved, changes }, signal);
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string' ? metadata.pending_changes : JSON.stringify(metadata.pending_changes)
          );
          setState(prev => ({ ...prev, proposedChanges }));
          updateStep('awaiting_approval', `${proposedChanges.changes.length} proposed changes awaiting review`);
        }
      } else if (jobStatus.status === 'completed') {
        updateStep('completed', approved ? 'Surgical edits applied successfully' : 'Changes rejected, generation continued');
      } else if (jobStatus.status === 'failed') {
        throw new Error(jobStatus.error || 'Job failed after approval');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to approve changes', true);
    }
  }, [state, client, updateStep, setError]);

  const continueJob = useCallback(async (continueJob: boolean) => {
    const { sessionId, jobId } = state;
    if (!sessionId || !jobId) { setError('Missing session or job ID'); return; }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      updateStep('polling', continueJob ? 'Continuing generation...' : 'Stopping job...');
      const jobStatus = await client.continueJob({ job_id: jobId, continue: continueJob }, sessionId, signal);
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string' ? metadata.pending_changes : JSON.stringify(metadata.pending_changes)
          );
          setState(prev => ({ ...prev, proposedChanges }));
          updateStep('awaiting_approval', `${proposedChanges.changes.length} proposed changes awaiting review`);
        }
      } else if (jobStatus.status === 'completed') {
        updateStep('completed', 'Document generation completed');
      } else if (jobStatus.status === 'failed') {
        throw new Error(jobStatus.error || 'Job failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to continue job', true);
    }
  }, [state, client, updateStep, setError]);

  const exportDocument = useCallback(async (format: 'pdf' | 'docx'): Promise<Blob> => {
    const { sessionId } = state;
    if (!sessionId) throw new Error('No active SuperDocs session');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      updateStep('exporting', `Exporting ${format.toUpperCase()}...`);
      const exportResult = await client.exportDocument({ session_id: sessionId, format }, signal);
      if (signal.aborted) throw new Error('Aborted');

      setState(prev => ({ ...prev, exportResult }));
      updateStep('saving', 'Downloading exported document...');
      const blob = await client.downloadExport(exportResult.download_url, signal);
      updateStep('completed', 'Export downloaded successfully');
      return blob;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      const message = error instanceof Error ? error.message : 'Export failed';
      setError(message, true);
      throw error;
    }
  }, [state, client, updateStep, setError]);

  return [state, { generateDocument, requestSurgicalEdits, approveChanges, continueJob, exportDocument, cancel, retry, dismissError, reset, resolveConflict, skipConflictCheck, restoreSession }];
}