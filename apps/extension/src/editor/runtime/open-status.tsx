import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';

export type EditorOpenStatus = 'idle' | 'loading' | 'switching' | 'error' | 'missing';

const logger = createLogger({ namespace: 'EditorOpenStatus' });

type EditorOpenStatusOwner = {
  status: EditorOpenStatus;
  runOpen: (action: () => Promise<void>) => Promise<void>;
  runSwitch: (action: () => Promise<void>) => Promise<void>;
};

export const EditorOpenStatusContext = createContext<EditorOpenStatusOwner | null>(null);

export function useEditorOpenStatusOwner(initialStatus: EditorOpenStatus): EditorOpenStatusOwner {
  const [status, setStatus] = useState<EditorOpenStatus>(initialStatus);
  const revision = useRef(0);
  const runOperation = useCallback(async (action: () => Promise<void>, switching: boolean) => {
    const current = ++revision.current;
    setStatus(switching ? 'switching' : 'loading');
    try {
      await action();
      if (revision.current === current) setStatus('idle');
    } catch (error) {
      const missingFile =
        error instanceof Error &&
        (error.name === 'MissingEditorOriginalError' ||
          error.name === 'MissingEditorDraftAssetError');
      if (!missingFile) logger.error('Opening editor document failed', error);
      if (revision.current === current) {
        const recoverableSwitch =
          switching && !(error instanceof Error && error.name === 'EditorSwitchRecoveryError');
        setStatus(recoverableSwitch ? 'idle' : missingFile ? 'missing' : 'error');
      }
      throw error;
    }
  }, []);
  const runOpen = useCallback(
    (action: () => Promise<void>) => runOperation(action, false),
    [runOperation]
  );
  const runSwitch = useCallback(
    (action: () => Promise<void>) => runOperation(action, true),
    [runOperation]
  );
  return { status, runOpen, runSwitch };
}

export function useEditorOpenStatus(): EditorOpenStatusOwner | null {
  return useContext(EditorOpenStatusContext);
}
