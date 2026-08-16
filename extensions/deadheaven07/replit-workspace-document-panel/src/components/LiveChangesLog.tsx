import { FileChangeEvent } from '../hooks/useFileWatcher';

interface LiveChangesLogProps {
  changes: FileChangeEvent[];
  maxVisible?: number;
  onClear?: () => void;
}

export function LiveChangesLog({ changes, maxVisible = 20, onClear }: LiveChangesLogProps) {
  const visibleChanges = changes.slice(0, maxVisible);
  
  if (visibleChanges.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        <svg className="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">No live changes detected yet</p>
        <p className="text-xs text-gray-400 mt-1">File modifications will appear here in real-time</p>
      </div>
    );
  }

  const getChangeIcon = (type: FileChangeEvent['type']) => {
    switch (type) {
      case 'created':
        return (
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      case 'modified':
        return (
          <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'deleted':
        return (
          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getChangeColor = (type: FileChangeEvent['type']) => {
    switch (type) {
      case 'created': return 'text-green-700 bg-green-50 border-green-200';
      case 'modified': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'deleted': return 'text-red-700 bg-red-50 border-red-200';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-2 max-h-[300px] overflow-auto">
      <div className="flex items-center justify-between px-2 pb-2 border-b border-gray-200">
        <h4 className="text-sm font-medium text-gray-900">Live Code Changes ({changes.length})</h4>
        {onClear && (
          <button
            onClick={onClear}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Clear change log"
          >
            Clear
          </button>
        )}
      </div>
      
      <div className="space-y-1" role="log" aria-live="polite" aria-label="Live file changes">
        {visibleChanges.map((change, index) => (
          <div
            key={`${change.path}-${change.timestamp}-${index}`}
            className={`px-3 py-2 rounded-lg border text-xs font-mono ${getChangeColor(change.type)} flex items-center gap-2 transition-opacity duration-300 ease-out`}
            style={{ opacity: 1, animationDelay: `${index * 50}ms` }}
          >
            {getChangeIcon(change.type)}
            <span className="flex-1 truncate">{change.path}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium capitalize">{change.type}</span>
            <span className="text-gray-400 whitespace-nowrap">{formatTime(change.timestamp)}</span>
            {change.previousHash && change.currentHash && change.previousHash !== change.currentHash && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-200 text-gray-600">
                Δ hash
              </span>
            )}
          </div>
        ))}
      </div>
      
      {changes.length > maxVisible && (
        <p className="text-center text-xs text-gray-500 pt-2">
          +{changes.length - maxVisible} more changes
        </p>
      )}
    </div>
  );
}

