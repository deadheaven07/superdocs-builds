import { ProposedChange } from '../types/superdocs';

interface LiveDiffProps {
  changes: ProposedChange[];
  documentType: 'readme' | 'spec' | 'user-guide';
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
}

function DiffBlock({ change }: { change: ProposedChange }) {
  const opStyles: Record<string, { bg: string; border: string; label: string; icon: string }> = {
    replace: { bg: 'bg-purple-50', border: 'border-purple-200', label: 'Replace', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    insert: { bg: 'bg-green-50', border: 'border-green-200', label: 'Insert', icon: 'M12 4v16m8-8H4' },
    delete: { bg: 'bg-red-50', border: 'border-red-200', label: 'Delete', icon: 'M6 18L18 6M6 6l12 12' },
    move: { bg: 'bg-blue-50', border: 'border-blue-200', label: 'Move', icon: 'M13 7l5 5m0 0l-5 5m5-5H6' },
  };

  const style = opStyles[change.operation] || { bg: 'bg-gray-50', border: 'border-gray-200', label: change.operation, icon: '' };

  return (
    <div className={`border rounded-lg p-4 ${style.border} bg-white`} aria-label={`Change ${change.change_id}: ${style.label}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {style.icon && (
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.icon} />
            </svg>
          )}
          <span className={`px-2 py-1 text-xs font-medium rounded ${style.bg} text-gray-700`}>
            {style.label}
          </span>
        </div>
        <span className="text-xs text-gray-400 font-mono flex-shrink-0">{change.change_id}</span>
      </div>

      {change.ai_explanation && (
        <p className="text-sm text-gray-600 mb-3 flex-1">{change.ai_explanation}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {change.old_html && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="font-medium text-red-700">Removed (Before)</span>
            </div>
            <pre className="whitespace-pre-wrap text-red-800 max-h-40 overflow-auto font-mono text-xs">
              {change.old_html.slice(0, 500)}{change.old_html.length > 500 ? '...' : ''}
            </pre>
          </div>
        )}
        {change.new_html && (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-medium text-green-700">Added (After)</span>
            </div>
            <pre className="whitespace-pre-wrap text-green-800 max-h-40 overflow-auto font-mono text-xs">
              {change.new_html.slice(0, 500)}{change.new_html.length > 500 ? '...' : ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveDiff({ changes, documentType, onAcceptAll, onRejectAll }: LiveDiffProps) {
  if (!changes || changes.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">No live diffs to display</p>
        <p className="text-xs text-gray-400 mt-1">AI-proposed changes will appear here when files change</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h4 className="text-sm font-medium text-gray-900">Live Document Diff ({changes.length})</h4>
          <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
            {documentType.toUpperCase()}
          </span>
        </div>
        <div className="flex gap-2">
          {onRejectAll && (
            <button
              onClick={onRejectAll}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              Reject All
            </button>
          )}
          {onAcceptAll && (
            <button
              onClick={onAcceptAll}
              className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
            >
              Accept All
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-auto" role="list" aria-label="Live document diffs">
        {changes.map((change) => (
          <DiffBlock key={change.change_id} change={change} />
        ))}
      </div>
    </div>
  );
}