import { useState, useCallback, useMemo, useRef } from 'react';
import { createSuperDocsClient } from '../services/superdocs';
import { parseProposedChangeBatch } from '../utils/parser';
import { DocumentUploadResult, ProposedChange, ExportResult, ProposedChangeBatch } from '../types/superdocs';

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
  | 'failed';

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
}

export interface SuperDocsActions {
  generateDocument: (instruction: string, documentType: string) => Promise<void>;
  approveChanges: (approved: boolean, changes: ProposedChange[]) => Promise<void>;
  continueJob: (continueJob: boolean) => Promise<void>;
  exportDocument: (format: 'pdf' | 'docx') => Promise<Blob>;
  cancel: () => void;
  retry: () => void;
  dismissError: () => void;
  reset: () => void;
}

export function useSuperDocs(apiKey: string): [SuperDocsState, SuperDocsActions] {
  const [state, setState] = useState<SuperDocsState>({ step: 'idle' });
  const client = useMemo(() => createSuperDocsClient(apiKey), [apiKey]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState({ step: 'idle' });
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

  const generateDocument = useCallback(async (instruction: string, documentType: string) => {
    if (!apiKey) { setError('SuperDocs API key is required', true); return; }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setState(prev => ({ ...prev, lastInstruction: instruction, lastDocumentType: documentType }));

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

  const retry = useCallback(() => {
    const { lastInstruction, lastDocumentType } = state;
    if (lastInstruction && lastDocumentType) {
      generateDocument(lastInstruction, lastDocumentType);
    }
  }, [state, generateDocument]);

  const approveChanges = useCallback(async (approved: boolean, changes: ProposedChange[]) => {
    const { sessionId, jobId } = state;
    if (!sessionId || !jobId) { setError('Missing session or job ID'); return; }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      const step = approved ? 'approving' : 'polling';
      const progress = approved ? 'Applying approved changes...' : 'Rejecting changes and continuing...';
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
        updateStep('completed', approved ? 'Changes applied successfully' : 'Changes rejected, generation continued');
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

  return [state, { generateDocument, approveChanges, continueJob, exportDocument, cancel, retry, dismissError, reset }];
}