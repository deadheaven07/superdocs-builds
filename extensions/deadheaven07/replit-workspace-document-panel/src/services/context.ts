import { buildProjectContext } from './replit';

export interface GenerationContext {
  documentType: 'readme' | 'spec' | 'user-guide';
  instruction: string;
  projectContext: string;
  selectedPaths: string[];
}

const DOCUMENT_TYPE_PROMPTS: Record<string, string> = {
  readme: `Generate a comprehensive README.md for this project. Include:
- Project title and description
- Features and capabilities
- Installation and setup instructions
- Usage examples
- Configuration options
- API documentation (if applicable)
- Contributing guidelines
- License information`,
  
  spec: `Generate a technical specification document for this project. Include:
- System overview and architecture
- Component/module breakdown
- Data models and schemas
- API endpoints and interfaces
- Configuration and environment
- Deployment requirements
- Testing strategy
- Security considerations`,
  
  'user-guide': `Generate a user-facing guide for this project. Include:
- Getting started tutorial
- Core concepts and terminology
- Step-by-step workflows
- Common use cases and examples
- Configuration guide
- Troubleshooting and FAQ
- Advanced features`,
};

export function createGenerationContext(
  documentType: 'readme' | 'spec' | 'user-guide',
  instruction: string,
  selectedFiles: Map<string, string>
): GenerationContext {
  const basePrompt = DOCUMENT_TYPE_PROMPTS[documentType] || DOCUMENT_TYPE_PROMPTS.readme;
  const { context: projectContext, skippedFiles } = buildProjectContext(selectedFiles, documentType);
  
  let finalInstruction = instruction.trim() || basePrompt;
  
  // If files were skipped due to size limit, prepend a warning to the instruction
  if (skippedFiles.length > 0) {
    const skippedList = skippedFiles.map(f => `\`${f.path}\``).join(', ');
    finalInstruction = `[WARNING: ${skippedFiles.length} file(s) skipped due to context size limit: ${skippedList}. The generated document may be incomplete.]\n\n${finalInstruction}`;
  }
  
  return {
    documentType,
    instruction: finalInstruction,
    projectContext,
    selectedPaths: Array.from(selectedFiles.keys()).sort(),
  };
}

export function buildSuperDocsInstruction(context: GenerationContext): string {
  return `${context.instruction}

---

## Project Context

${context.projectContext}

---

Please generate a ${context.documentType === 'readme' ? 'README.md' : context.documentType === 'spec' ? 'SPEC.md' : 'USER_GUIDE.md'} based on the above project context and instruction.`;
}

export function buildRevisionInstruction(
  context: GenerationContext,
  changedFiles: string[],
  previousInstruction?: string
): string {
  const baseInstruction = previousInstruction || context.instruction;
  
  return `${baseInstruction}

---

## Code Changes Detected

The following files have been modified since the last document generation:
${changedFiles.map(f => `- \`${f}\``).join('\n')}

Please update the ${context.documentType} to reflect these changes. Focus on:
- Updated API endpoints, function signatures, or interfaces
- New features or configuration options
- Removed or deprecated functionality
- Changes to installation, usage, or configuration steps

---

## Project Context (Updated)

${context.projectContext}
`;
}