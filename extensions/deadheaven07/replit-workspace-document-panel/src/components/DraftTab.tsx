import { useState, useCallback } from 'react';

interface DraftTabProps {
  onGenerate: (documentType: 'readme' | 'spec' | 'user-guide', instruction: string) => void;
  disabled: boolean;
  fileCount: number;
}

const DOCUMENT_TYPES: Array<{ id: 'readme' | 'spec' | 'user-guide'; label: string; description: string }> = [
  { id: 'readme', label: 'README', description: 'Project overview, installation, usage, and configuration' },
  { id: 'spec', label: 'Specification', description: 'Architecture, components, APIs, data models, and deployment' },
  { id: 'user-guide', label: 'User Guide', description: 'Tutorials, workflows, examples, and troubleshooting' },
];

const DEFAULT_INSTRUCTIONS: Record<string, string> = {
  readme: 'Generate a comprehensive README.md for this project. Include project description, features, installation, usage examples, and configuration.',
  spec: 'Generate a technical specification document. Include architecture overview, component breakdown, data models, API interfaces, and deployment requirements.',
  'user-guide': 'Generate a user-facing guide. Include getting started tutorial, core concepts, step-by-step workflows, and troubleshooting.',
};

export function DraftTab({ onGenerate, disabled, fileCount }: DraftTabProps) {
  const [documentType, setDocumentType] = useState<'readme' | 'spec' | 'user-guide'>('readme');
  const [instruction, setInstruction] = useState('');

  const handleGenerate = useCallback(() => {
    const finalInstruction = instruction.trim() || DEFAULT_INSTRUCTIONS[documentType];
    onGenerate(documentType, finalInstruction);
  }, [documentType, instruction, onGenerate]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">Create Documentation</h3>
        <p className="text-xs text-gray-500">Generate documentation from selected project files using SuperDocs.</p>
      </div>

      {/* Document Type Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Document type">
          {DOCUMENT_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              role="radio"
              aria-checked={documentType === type.id}
              onClick={() => setDocumentType(type.id)}
              className={`relative flex-1 rounded-lg border-2 text-xs font-medium text-center transition-all focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                documentType === type.id
                  ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
              disabled={disabled}
            >
              <div className="font-medium">{type.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{type.description}</div>
              {documentType === type.id && (
                <div className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-primary-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Instruction for SuperDocs
        </label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          placeholder={DEFAULT_INSTRUCTIONS[documentType]}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
          aria-describedby="instruction-hint"
        />
        <p id="instruction-hint" className="text-xs text-gray-500 mt-1">
          Leave empty to use the default instruction for the selected document type.
        </p>
      </div>

      {/* Context Summary */}
      <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">
            {fileCount} file{fileCount !== 1 ? 's' : ''} selected for context
          </span>
        </div>
      </div>

      {/* Primary CTA */}
      <div className="pt-3">
        <button
          onClick={handleGenerate}
          disabled={disabled || fileCount === 0}
          className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Generate Document
        </button>
        {fileCount === 0 && !disabled && (
          <p className="text-xs text-gray-500 text-center mt-2">Select at least one file to generate a document</p>
        )}
      </div>
    </div>
  );
}