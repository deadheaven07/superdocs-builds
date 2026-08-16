/// <reference lib="dom" />

export interface GitIgnoreRule {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  absolute: boolean;
}

const DEFAULT_EXCLUDES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
  '.vercel',
  '.netlify',
  'coverage',
  '.next',
  '.turbo',
  'vendor',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'venv',
  '.venv',
  'env',
  '.env',
];

const DEFAULT_EXCLUDE_PATTERNS = [
  '*.lock',
  '*.log',
  '*.map',
  '*.min.js',
  '*.min.css',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.svg',
  '*.pdf',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.class',
  '*.jar',
  '*.pyc',
  '*.pyo',
  '*.pyd',
];

function parseGitIgnore(content: string): GitIgnoreRule[] {
  const rules: GitIgnoreRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    let pattern = trimmed;
    let negated = false;
    let directoryOnly = false;
    let absolute = false;

    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }

    if (pattern.endsWith('/')) {
      directoryOnly = true;
      pattern = pattern.slice(0, -1);
    }

    if (pattern.startsWith('/')) {
      absolute = true;
      pattern = pattern.slice(1);
    }

    if (pattern) {
      rules.push({ pattern, negated, directoryOnly, absolute });
    }
  }

  return rules;
}

function matchPattern(path: string, rule: GitIgnoreRule, isDirectory: boolean): boolean {
  const { pattern, directoryOnly, absolute } = rule;

  if (directoryOnly && !isDirectory) {
    return false;
  }

  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, 'GLOBSTAR')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/GLOBSTAR/g, '.*');

  if (absolute) {
    regexPattern = '^' + regexPattern;
  } else {
    regexPattern = '(^|/)' + regexPattern;
  }

  if (directoryOnly) {
    regexPattern += '(/.*)?$';
  } else {
    regexPattern += '($|/)';
  }

  const regex = new RegExp(regexPattern);
  return regex.test(path);
}

export function shouldIgnorePath(path: string, rules: GitIgnoreRule[], isDirectory: boolean): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (matchPattern(path, rule, isDirectory)) {
      ignored = !rule.negated;
    }
  }

  return ignored;
}

export async function loadGitIgnoreRules(replit: { fs: { readFile: (path: string, encoding: string) => Promise<{ content?: string; error?: string }> } }): Promise<GitIgnoreRule[]> {
  try {
    const result = await replit.fs.readFile('.gitignore', 'utf8');
    if ('error' in result || !result.content) {
      return [];
    }
    return parseGitIgnore(result.content);
  } catch {
    return [];
  }
}

export function createShouldIgnore(
  gitIgnoreRules: GitIgnoreRule[],
  isDirectory: boolean = false
): (path: string) => { ignored: boolean; reason?: string } {
  return (path: string) => {
    for (const rule of gitIgnoreRules) {
      if (matchPattern(path, rule, isDirectory)) {
        if (!rule.negated) {
          return { ignored: true, reason: `.gitignore: ${rule.pattern}` };
        }
      }
    }

    for (const exclude of DEFAULT_EXCLUDES) {
      if (path === exclude || path.startsWith(exclude + '/') || path.endsWith('/' + exclude)) {
        return { ignored: true, reason: `default exclude: ${exclude}` };
      }
    }

    const fileName = path.split('/').pop() || '';
    if (fileName.startsWith('.env')) {
      return { ignored: true, reason: 'environment file' };
    }

    for (const pattern of DEFAULT_EXCLUDE_PATTERNS) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(regexPattern + '$');
      if (regex.test(fileName)) {
        return { ignored: true, reason: `default pattern: ${pattern}` };
      }
    }

    return { ignored: false };
  };
}