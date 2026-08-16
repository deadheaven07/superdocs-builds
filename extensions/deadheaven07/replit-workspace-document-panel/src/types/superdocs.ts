export interface DocumentUploadResult {
  session_id: string;
  document_id: string;
  chunks_count: number;
  version_id: string;
  page_setup: Record<string, unknown>;
  html?: string;
  focused_document_id?: string;
}

export interface AttachmentUploadResult {
  job_id: string;
  filename: string;
  status: string;
}

export interface JobStatus {
  job_id: string;
  status: string;
  result?: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProposedChange {
  change_id: string;
  operation: string;
  chunk_id?: string;
  old_html?: string;
  new_html?: string;
  ai_explanation: string;
  insert_after_chunk_id?: string;
  document_id?: string;
}

export interface ProposedChangeBatch {
  batch_id: string;
  batch_total: number;
  changes: ProposedChange[];
  awaiting_kind: string;
  continue_prompt?: Record<string, unknown>;
}

export interface ExportResult {
  download_url: string;
  filename: string;
  format: string;
}

export interface ChatAsyncRequest {
  message: string;
  session_id: string;
  document_html?: string;
  approval_mode?: string;
  model_tier?: string;
}

export interface ApproveChangesRequest {
  job_id: string;
  approved: boolean;
  changes: ProposedChange[];
  feedback?: string;
  session_id: string;
}

export interface ContinueJobRequest {
  job_id: string;
  continue: boolean;
}

export interface ExportDocumentRequest {
  session_id: string;
  format: 'pdf' | 'docx';
  options?: Record<string, unknown>;
}

export type JobStatusValue = 'processing' | 'awaiting_approval' | 'completed' | 'failed';

export interface SuperDocsConfig {
  baseUrl: string;
  apiKey: string;
}

export interface UploadDocumentRequest {
  filename: string;
  file_base64: string;
  session_id?: string;
  return_html?: boolean;
}

export interface SessionInitRequest {
  session_id?: string;
}

export interface FileConflict {
  path: string;
  baselineHash: string;
  currentHash: string;
  baselineContent: string;
  currentContent: string;
  diff: string;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: FileConflict[];
  checkedFiles: string[];
}

export interface ConflictResolutionAction {
  type: 'overwrite_ai' | 'keep_local' | 'abort';
  conflictPath: string;
}

export interface SurgicalEditInstruction {
  changedFiles: Array<{ path: string; oldContent?: string; newContent: string }>;
  addedFiles: Array<{ path: string; content: string }>;
  removedFiles: string[];
  documentType: 'readme' | 'spec' | 'user-guide';
  originalInstruction: string;
}