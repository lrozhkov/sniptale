import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';

export type EditorOpenStatus = 'idle' | 'loading' | 'error';

const logger = createLogger({ namespace: 'EditorOpenStatus' });

type EditorOpenStatusOwner = {
  status: EditorOpenStatus;
  runOpen: (action: () => Promise<void>) => Promise<void>;
};

export const EditorOpenStatusContext = createContext<EditorOpenStatusOwner | null>(null);

export function useEditorOpenStatusOwner(initialStatus: EditorOpenStatus): EditorOpenStatusOwner {
  const [status, setStatus] = useState<EditorOpenStatus>(initialStatus);
  const revision = useRef(0);
  const runOpen = useCallback(async (action: () => Promise<void>) => {
    const current = ++revision.current;
    setStatus('loading');
    try {
      await action();
      if (revision.current === current) setStatus('idle');
    } catch (error) {
      logger.error('Opening editor document failed', error);
      if (revision.current === current) setStatus('error');
      throw error;
    }
  }, []);
  return { status, runOpen };
}

export function useEditorOpenStatus(): EditorOpenStatusOwner | null {
  return useContext(EditorOpenStatusContext);
}
