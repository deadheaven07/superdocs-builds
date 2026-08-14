import { ProposedChangeBatch, ProposedChange } from '../types/superdocs';

interface ReviewTabProps {
  proposedChanges: ProposedChangeBatch | undefined;
  onApprove: (approved: boolean, changes: ProposedChange[]) => void;
  onContinue: (continueJob: boolean) => void;
  disabled: boolean;
  step: string;
}

const OPERATION_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  replace: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Replace' },
  insert: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'Insert' },
  delete: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Delete' },
  move: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Move' },
};

function formatHtmlSnippet(html: string): string {
  return html.replace(/</g, '<').replace(/>/g, '>').slice(0, 400);
}

function ChangeItem({ change }: { change: ProposedChange }) {
  const opStyle = OPERATION_STYLES[change.operation] || {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    label: change.operation,
  };

  return (
    <div className={`border rounded-lg p-4 ${opStyle.border} bg-white`}
      aria-label={`Change ${change.change_id}: ${opStyle.label}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`px-2 py-1 text-xs font-medium rounded ${opStyle.bg} ${opStyle.text}`}>
          {opStyle.label}
        </span>
        <span className="text-xs text-gray-400 font-mono flex-shrink-0">{change.change_id}</span>
      </div>

      {change.ai_explanation && (
        <p className="text-sm text-gray-600 mb-3 flex-1">{change.ai_explanation}</p>
      )}

      {(change.old_html || change.new_html) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {change.old_html && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="font-medium text-red-700">Removed</span>
              </div>
              <pre className="whitespace-pre-wrap text-red-800 max-h-40 overflow-auto font-mono text-xs">
                {formatHtmlSnippet(change.old_html)}{change.old_html.length > 400 ? '...' : ''}
              </pre>
            </div>
          )}
          {change.new_html && (
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-medium text-green-700">Added</span>
              </div>
              <pre className="whitespace-pre-wrap text-green-800 max-h-40 overflow-auto font-mono text-xs">
                {formatHtmlSnippet(change.new_html)}{change.new_html.length > 400 ? '...' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReviewTabProps {
  proposedChanges: ProposedChangeBatch | undefined;
  onApprove: (approved: boolean, changes: ProposedChange[]) => void;
  onContinue: (continueJob: boolean) => void;
  disabled: boolean;
  step: string;
}

export function ReviewTab({ proposedChanges, onApprove, onContinue, disabled, step }: ReviewTabProps) {
  if (!proposedChanges || proposedChanges.changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium">No proposed changes</p>
        <p className="text-sm text-gray-500 mt-1 max-w-xs text-center">
          {step === 'polling' && 'Waiting for SuperDocs to process...'}
          {step === 'generating' && 'Generating initial document...'}
          {step === 'awaiting_approval' && 'Changes will appear here when ready for review'}
          {step === 'completed' && 'Document generation completed'}
        </p>
      </div>
    );
  }


  const isProcessing = ['polling', 'generating', 'approving'].includes(step);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">
            {proposedChanges.changes.length} proposed change{proposedChanges.changes.length !== 1 ? 's' : ''}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {proposedChanges.awaiting_kind === 'continue'
              ? 'SuperDocs is asking to continue'
              : 'Awaiting your approval'}
          </p>
        </div>
        {proposedChanges.continue_prompt && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex-1">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-yellow-800">{String(proposedChanges.continue_prompt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Changes List */}
      <div className="space-y-3 max-h-[500px] overflow-auto" role="list" aria-label="Proposed changes">
        {proposedChanges.changes.map((change) => (
          <ChangeItem key={change.change_id} change={change} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-gray-200">
        {step === 'awaiting_approval' && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:flex-1">
            <button
              onClick={() => onApprove(true, proposedChanges.changes)}
              disabled={disabled}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              aria-label="Approve changes"
            >
              <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve Changes
            </button>
            <button
              onClick={() => onApprove(false, proposedChanges.changes)}
              disabled={disabled}
              className="px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              aria-label="Reject changes"
            >
              <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
          </div>
        )}
        
        {proposedChanges.awaiting_kind === 'continue' && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:flex-1">
            <button
              onClick={() => onContinue(true)}
              disabled={disabled}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              aria-label="Continue"
            >
              <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Continue
            </button>
            <button
              onClick={() => onContinue(false)}
              disabled={disabled}
              className="px-4 py-2.5 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              aria-label="Stop"
            >
              Stop
            </button>
          </div>
        )}
        
        {step === 'completed' && (
          <div className="flex-1 text-center text-green-600 font-medium flex items-center justify-center">
            <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Document generation complete
          </div>
        )}
        
        {isProcessing && (
          <div className="flex-1 text-center text-gray-500 font-medium flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mr-2" />
            Processing...
          </div>
        )}
      </div>
    </div>
  );
}