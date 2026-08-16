import { useState, useCallback, useEffect } from 'react';
import { useReplit } from '@replit/extensions-react';
import { FileTree } from './FileTree';
import { DraftTab } from './DraftTab';
import { ReviewTab } from './ReviewTab';
import { ExportTab } from './ExportTab';
import { StatusBadge } from './StatusBadge';
import { useWorkspaceFiles } from '../hooks/useWorkspaceFiles';
import { useSuperDocs } from '../hooks/useSuperDocs';
import { useFileHashes } from '../hooks/useFileHashes';
import { useStatePersistence } from '../hooks/useStatePersistence';
import { createGenerationContext, buildSuperDocsInstruction } from '../services/context';

type Tab = 'files' | 'draft' | 'review' | 'export';

export function DocumentPanel() {
  const { status } = useReplit();
  const { fileTree, readFile, writeFile } = useWorkspaceFiles();
  
  // Session persistence
  const [persistedState, updatePersistedState] = useStatePersistence();
  
  const [activeTab, setActiveTab] = useState<Tab>('files');
  const [selectedPaths, setSelectedPaths] = useState<string[]>(persistedState.selectedPaths);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [lastContext, setLastContext] = useState<{ files: Map<string, string>; documentType: string; instruction: string; originalInstruction: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fileLoading, setFileLoading] = useState(false);

  const [superDocsState, superDocsActions] = useSuperDocs(apiKey);
  const { captureHashes } = useFileHashes();
  
  // Persist SuperDocs state changes
  useEffect(() => {
    updatePersistedState({
      sessionId: superDocsState.sessionId,
      documentId: superDocsState.documentId,
      documentType: superDocsState.lastDocumentType as 'readme' | 'spec' | 'user-guide',
      jobId: superDocsState.jobId,
      proposedChanges: superDocsState.proposedChanges,
      exportResult: superDocsState.exportResult,
    });
  }, [superDocsState, updatePersistedState]);

  // Persist selected paths
  useEffect(() => {
    updatePersistedState({ selectedPaths });
  }, [selectedPaths, updatePersistedState]);

  const selectedFilesCount = selectedPaths.length;

  const handleGenerate = useCallback(async (documentType: 'readme' | 'spec' | 'user-guide', instruction: string) => {
    const files = new Map<string, string>();
    const pathsToRead = [...selectedPaths];
    
    setFileLoading(true);
    try {
      for (const path of pathsToRead) {
        const content = await readFile(path);
        if (content !== null) files.set(path, content);
      }
    } finally {
      setFileLoading(false);
    }

    if (files.size === 0) return;

    const context = createGenerationContext(documentType, instruction, files);
    const superDocsInstruction = buildSuperDocsInstruction(context);

    setLastContext({ files, documentType, instruction: superDocsInstruction, originalInstruction: instruction });
    await captureHashes(files);

    await superDocsActions.generateDocument(superDocsInstruction, documentType);
    setActiveTab('review');
  }, [selectedPaths, readFile, superDocsActions, captureHashes]);

  const handleRegenerate = useCallback(async () => {
    if (!lastContext) return;

    const files = new Map<string, string>();
    const pathsToRead = Array.from(lastContext.files.keys());

    setFileLoading(true);
    try {
      for (const path of pathsToRead) {
        const content = await readFile(path);
        if (content !== null) files.set(path, content);
      }
    } finally {
      setFileLoading(false);
    }

    if (files.size === 0) return;

    const context = createGenerationContext(lastContext.documentType as 'readme' | 'spec' | 'user-guide', lastContext.originalInstruction, files);
    const superDocsInstruction = buildSuperDocsInstruction(context);

    setLastContext({ ...lastContext, files });
    await captureHashes(files);

    await superDocsActions.generateDocument(superDocsInstruction, lastContext.documentType, superDocsState.sessionId);
    setActiveTab('review');
  }, [lastContext, readFile, captureHashes, superDocsActions, superDocsState.sessionId]);

  const handleApprove = useCallback(async (approved: boolean, changes: { change_id: string; operation: string; chunk_id?: string; old_html?: string; new_html?: string; ai_explanation: string; insert_after_chunk_id?: string; document_id?: string }[]) => {
    await superDocsActions.approveChanges(approved, changes);
  }, [superDocsActions]);

  const handleContinue = useCallback(async (continueJob: boolean) => {
    await superDocsActions.continueJob(continueJob);
  }, [superDocsActions]);

  const checkFileExists = useCallback(async (path: string): Promise<boolean> => {
    const content = await readFile(path);
    return content !== null;
  }, [readFile]);

  const handleExport = useCallback(async (format: 'pdf' | 'docx', destination: string) => {
    const blob = await superDocsActions.exportDocument(format);
    await writeFile(destination, blob);
    if (lastContext) await captureHashes(lastContext.files);
  }, [superDocsActions, writeFile, lastContext, captureHashes]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-3" />
          <p className="text-gray-600">Connecting to Replit...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.36 0L3.36 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-lg font-medium text-red-600">Failed to connect to Replit</h2>
        </div>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
          Reload Extension
        </button>
      </div>
    );
  }

  const isProcessing = ['uploading', 'generating', 'polling', 'approving', 'exporting', 'saving'].includes(superDocsState.step);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">SuperDocs</h1>
              <p className="text-xs text-gray-500">Replit Document Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!apiKey && (
              <button onClick={() => setShowApiKeyInput(true)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                Set API Key
              </button>
            )}
            {apiKey && <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">API Key Set</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-3 border-b border-gray-200" role="tablist" aria-label="Main navigation">
        {(['files', 'draft', 'review', 'export'] as Tab[]).map((tab) => (
          <button key={tab} role="tab" aria-selected={activeTab === tab} aria-controls={`${tab}-panel`} id={`${tab}-tab`} onClick={() => setActiveTab(tab)} className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`} disabled={tab !== 'files' && !apiKey}>
            {tab === 'files' ? 'Files' : tab === 'draft' ? 'Draft' : tab === 'review' ? 'Review' : 'Export'}
          </button>
        ))}
      </div>

      {/* API Key Input */}
      {showApiKeyInput && (
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-md mx-auto">
            <label className="block text-sm font-medium text-gray-700 mb-2">SuperDocs API Key</label>
            <div className="flex gap-2">
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm" />
              <button onClick={() => setShowApiKeyInput(false)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">Save</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Get your API key from <a href="https://use.superdocs.app" target="_blank" rel="noopener" className="text-primary-600 hover:underline">use.superdocs.app</a>. The key is stored in memory only and never persisted.</p>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <StatusBadge step={superDocsState.step} progress={superDocsState.progress} error={superDocsState.error} canRetry={superDocsState.canRetry} onRetry={superDocsActions.retry} onDismiss={superDocsActions.dismissError} />
        {isProcessing && (
          <div className="mt-2 flex justify-end">
            <button onClick={superDocsActions.cancel} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
          </div>
        )}
        {fileLoading && !isProcessing && (
          <div className="mt-2 flex justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
              <span>Reading project files...</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'files' && (
          <div id="files-panel" role="tabpanel" aria-labelledby="files-tab" className="space-y-4">
            <FileTree nodes={fileTree} selectedPaths={selectedPaths} onSelectionChange={setSelectedPaths} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 text-center">{fileTree.length === 0 ? 'No files found' : 'Select files to include in document context'}</p>
            </div>
          </div>
        )}

        {activeTab === 'draft' && (
          <div id="draft-panel" role="tabpanel" aria-labelledby="draft-tab" className="max-w-2xl mx-auto">
            <DraftTab onGenerate={handleGenerate} disabled={isProcessing || !apiKey} fileCount={selectedFilesCount} />
          </div>
        )}

        {activeTab === 'review' && (
          <div id="review-panel" role="tabpanel" aria-labelledby="review-tab" className="max-w-3xl mx-auto">
            <ReviewTab
              proposedChanges={superDocsState.proposedChanges}
              onApprove={handleApprove}
              onContinue={handleContinue}
              disabled={isProcessing}
              step={superDocsState.step}
            />
          </div>
        )}

        {activeTab === 'export' && (
          <div id="export-panel" role="tabpanel" aria-labelledby="export-tab" className="max-w-xl mx-auto">
            <ExportTab onExport={handleExport} checkFileExists={checkFileExists} disabled={isProcessing || !apiKey} step={superDocsState.step} defaultDestination={`docs/${lastContext?.documentType?.toUpperCase() || 'README'}.${superDocsState.exportResult?.format || 'pdf'}`} />
          </div>
        )}

        {/* Regenerate Button */}
        {lastContext && superDocsState.step === 'completed' && (
          <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
            <button
              onClick={handleRegenerate}
              disabled={isProcessing}
              className="w-full px-4 py-2.5 bg-primary-100 text-primary-700 rounded-lg font-medium hover:bg-primary-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate Document
            </button>
            <p className="text-xs text-gray-500 text-center">
              Re-reads selected files and regenerates the document from scratch using the same SuperDocs session.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}