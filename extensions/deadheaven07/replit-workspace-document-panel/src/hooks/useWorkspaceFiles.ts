import { useState, useCallback, useEffect } from 'react';
import { useReplit } from '@replit/extensions-react';
import { FileTreeNode } from '../services/replit';
import { shouldIgnore } from '../services/replit';

export function useWorkspaceFiles() {
  const { replit, status } = useReplit();
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFileTree = useCallback(async () => {
    if (!replit || status !== 'ready') return;
    
    setLoading(true);
    setError(null);
    
    try {
      async function readDirRecursive(path: string = ''): Promise<FileTreeNode[]> {
        const result = await replit.fs.readDir(path);
        if ('error' in result) {
          console.warn(`Failed to read directory ${path}: ${result.error}`);
          return [];
        }
        
        const dirResult = result as { children: Array<{ filename: string; type: 'FILE' | 'DIRECTORY' }> };
        
        const children: FileTreeNode[] = [];
        
        for (const child of dirResult.children ?? []) {
          const childPath = path ? `${path}/${child.filename}` : child.filename;
          const { ignored, reason } = shouldIgnore(childPath);
          
          if (child.type === 'DIRECTORY') {
            const subChildren = await readDirRecursive(childPath);
            children.push({
              name: child.filename,
              path: childPath,
              isDirectory: true,
              children: subChildren,
              ignored,
              ignoreReason: reason,
            });
          } else {
            children.push({
              name: child.filename,
              path: childPath,
              isDirectory: false,
              ignored,
              ignoreReason: reason,
            });
          }
        }
        
        return children.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }
      
      const tree = await readDirRecursive();
      setFileTree(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file tree');
    } finally {
      setLoading(false);
    }
  }, [replit, status]);

  useEffect(() => {
    if (status === 'ready') {
      loadFileTree();
    }
  }, [status, loadFileTree]);

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    if (!replit) return null;
    
    try {
      const result = await replit.fs.readFile(path, 'utf8');
      if ('error' in result) {
        console.warn(`Failed to read ${path}: ${result.error}`);
        return null;
      }
      return result.content;
    } catch (err) {
      console.warn(`Error reading ${path}:`, err);
      return null;
    }
  }, [replit]);

  const writeFile = useCallback(async (path: string, content: string | Blob): Promise<void> => {
    if (!replit) throw new Error('Replit not initialized');
    
    const dirPath = path.split('/').slice(0, -1).join('/');
    if (dirPath) {
      try {
        await replit.fs.createDir(dirPath);
      } catch {
        // Directory may already exist
      }
    }
    
    const result = await replit.fs.writeFile(path, content);
    if ('error' in result) {
      throw new Error(`Failed to write file: ${result.error}`);
    }
  }, [replit]);

  return { fileTree, loading, error, readFile, writeFile, refresh: loadFileTree };
}