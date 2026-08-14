import { useState, useCallback, useMemo } from 'react';
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
}

export interface SuperDocsActions {
  generateDocument: (instruction: string, projectContext: string, documentType: string) => Promise<void>;
  approveChanges: (approved: boolean, changes: ProposedChange[]) => Promise<void>;
  continueJob: (continueJob: boolean) => Promise<void>;
  exportDocument: (format: 'pdf' | 'docx') => Promise<Blob>;
  reset: () => void;
}

export function useSuperDocs(apiKey: string): [SuperDocsState, SuperDocsActions] {
  const [state, setState] = useState<SuperDocsState>({
    step: 'idle',
  });

  const client = useMemo(() => createSuperDocsClient(apiKey), [apiKey]);

  const reset = useCallback(() => {
    setState({ step: 'idle' });
  }, []);

  const updateStep = useCallback((step: GenerationStep, progress?: string) => {
    setState(prev => ({ ...prev, step, progress, error: undefined }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, step: 'failed', error }));
  }, []);

  const generateDocument = useCallback(async (
    instruction: string,
    projectContext: string,
    documentType: string
  ) => {
    if (!apiKey) {
      setError('SuperDocs API key is required');
      return;
    }

    try {
      updateStep('uploading', 'Uploading document to SuperDocs...');
      
      const filename = `${documentType.toUpperCase()}.md`;
      const uploadResult = await client.uploadDocument(filename, projectContext);
      
      setState(prev => ({ ...prev, sessionId: uploadResult.session_id, documentId: uploadResult.document_id, uploadResult }));
      
      updateStep('generating', 'Starting document generation...');
      
      const jobId = await client.chatAsync({
        message: instruction,
        session_id: uploadResult.session_id,
        approval_mode: 'ask_every_time',
        model_tier: 'core',
      });
      
      setState(prev => ({ ...prev, jobId }));
      updateStep('polling', 'Waiting for SuperDocs to process...');
      
      const jobStatus = await client.waitForJob(jobId, (status) => {
        updateStep('polling', `Processing... (${status.status})`);
      });
      
      setState(prev => ({ ...prev, jobId: jobStatus.job_id }));
      
      if (jobStatus.status === 'failed') {
        throw new Error(jobStatus.error || 'Job failed');
      }
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string'
              ? metadata.pending_changes
              : JSON.stringify(metadata.pending_changes)
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
      setError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [apiKey, client, updateStep, setError]);

  const approveChanges = useCallback(async (approved: boolean, changes: ProposedChange[]) => {
    const { sessionId, jobId } = state;
    if (!sessionId || !jobId) {
      setError('Missing session or job ID');
      return;
    }

    try {
      updateStep(approved ? 'approving' : 'generating', approved ? 'Applying approved changes...' : 'Continuing with rejected changes...');
      
      const jobStatus = await client.approveChanges({
        session_id: sessionId,
        job_id: jobId,
        approved,
        changes,
      });
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string'
              ? metadata.pending_changes
              : JSON.stringify(metadata.pending_changes)
          );
          setState(prev => ({ ...prev, proposedChanges }));
          updateStep('awaiting_approval', `${proposedChanges.changes.length} proposed changes awaiting review`);
        }
      } else if (jobStatus.status === 'completed') {
        updateStep('completed', 'Document generation completed');
      } else if (jobStatus.status === 'failed') {
        throw new Error(jobStatus.error || 'Job failed after approval');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to approve changes');
    }
  }, [state, client, updateStep, setError]);

  const continueJob = useCallback(async (continueJob: boolean) => {
    const { sessionId, jobId } = state;
    if (!sessionId || !jobId) {
      setError('Missing session or job ID');
      return;
    }

    try {
      updateStep('generating', continueJob ? 'Continuing generation...' : 'Stopping job...');
      
      const jobStatus = await client.continueJob({ job_id: jobId, continue: continueJob }, sessionId);
      
      if (jobStatus.status === 'awaiting_approval') {
        const metadata = jobStatus.metadata;
        if (metadata && metadata.pending_changes) {
          const proposedChanges = parseProposedChangeBatch(
            typeof metadata.pending_changes === 'string'
              ? metadata.pending_changes
              : JSON.stringify(metadata.pending_changes)
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
      setError(error instanceof Error ? error.message : 'Failed to continue job');
    }
  }, [state, client, updateStep, setError]);

  const exportDocument = useCallback(async (format: 'pdf' | 'docx'): Promise<Blob> => {
    const { sessionId } = state;
    if (!sessionId) {
      throw new Error('No active SuperDocs session');
    }

    try {
      updateStep('exporting', `Exporting ${format.toUpperCase()}...`);
      
      const exportResult = await client.exportDocument({
        session_id: sessionId,
        format,
      });
      
      setState(prev => ({ ...prev, exportResult }));
      updateStep('saving', 'Downloading exported document...');
      
      const blob = await client.downloadExport(exportResult.download_url);
      updateStep('completed', 'Export downloaded successfully');
      
      return blob;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      setError(message);
      throw error;
    }
  }, [state, client, updateStep, setError]);

  return [state, { generateDocument, approveChanges, continueJob, exportDocument, reset }];
}