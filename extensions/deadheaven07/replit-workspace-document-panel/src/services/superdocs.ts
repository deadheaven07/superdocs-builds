import {
  SuperDocsConfig,
  DocumentUploadResult,
  JobStatus,
  ExportResult,
  ChatAsyncRequest,
  ApproveChangesRequest,
  ContinueJobRequest,
  ExportDocumentRequest,
  SessionInitRequest,
} from '../types/superdocs';

const DEFAULT_BASE_URL = 'https://api.superdocs.app';
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200;

export class SuperDocsClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: SuperDocsConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SuperDocs API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async initSession(sessionId?: string): Promise<string> {
    const payload: SessionInitRequest = sessionId ? { session_id: sessionId } : {};
    const response = await this.request<{ session_id: string }>('/v1/sessions/init', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.session_id;
  }

  async uploadDocument(
    filename: string,
    content: string,
    sessionId?: string,
    returnHtml = true
  ): Promise<DocumentUploadResult> {
    const session_id = sessionId || (await this.initSession());
    const file_base64 = btoa(content);

    const payload = {
      filename,
      file_base64,
      return_html: returnHtml,
      session_id,
    };

    const response = await this.request<DocumentUploadResult>('/v1/documents/upload-base64', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      session_id: response.session_id || session_id,
      document_id: response.document_id || response.focused_document_id || 'doc_primary',
      chunks_count: response.chunks_count ?? 0,
      version_id: response.version_id ?? '',
      page_setup: response.page_setup ?? {},
      html: response.html,
    };
  }

  async chatAsync(request: ChatAsyncRequest): Promise<string> {
    const response = await this.request<{ job_id: string }>('/v1/chat/async', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response.job_id;
  }

  async pollJob(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/v1/jobs/${jobId}`);
  }

  async waitForJob(
    jobId: string,
    onProgress?: (status: JobStatus) => void
  ): Promise<JobStatus> {
    let polls = 0;

    while (polls < MAX_POLLS) {
      const status = await this.pollJob(jobId);

      if (onProgress) {
        onProgress(status);
      }

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'awaiting_approval') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      polls++;
    }

    throw new Error(`Job ${jobId} timed out after ${MAX_POLLS * POLL_INTERVAL_MS / 1000} seconds`);
  }

  async approveChanges(request: ApproveChangesRequest): Promise<JobStatus> {
    const { session_id, ...payload } = request;
    return this.request<JobStatus>(`/v1/chat/${session_id}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async continueJob(request: ContinueJobRequest, sessionId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/v1/chat/${sessionId}/continue`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async exportDocument(request: ExportDocumentRequest): Promise<ExportResult> {
    return this.request<ExportResult>('/v1/documents/export', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async downloadExport(downloadUrl: string): Promise<Blob> {
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download export: ${response.status}`);
    }

    return response.blob();
  }
}

export function createSuperDocsClient(apiKey: string, baseUrl = DEFAULT_BASE_URL): SuperDocsClient {
  return new SuperDocsClient({ baseUrl, apiKey });
}