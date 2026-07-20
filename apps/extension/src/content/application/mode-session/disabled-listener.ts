import { useEffect, useRef } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  addContentModeDisabledListener,
  addContentModeEnabledListener,
} from '../../platform/page-context/mode-events';

const logger = createLogger({ namespace: 'ContentModeDisabledListener' });

interface UseModeDisabledListenerParams {
  aiPickMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
  setAiPickMode: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditDocumentMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
}

type ContentModeDisabledSnapshot = UseModeDisabledListenerParams;

function handleContentModeDisabled(snapshot: ContentModeDisabledSnapshot, mode: string) {
  logger.log('Mode disabled via ESC', mode);

  if (mode === 'ai-pick' && snapshot.aiPickMode) {
    snapshot.setAiPickMode(false);
    return;
  }

  if (mode === 'highlighter' && snapshot.highlighterMode) {
    snapshot.setHighlighterMode(false);
    return;
  }

  if (mode === 'quick-edit') {
    snapshot.setQuickEditDocumentMode(false);
    if (snapshot.quickEditMode) {
      snapshot.setQuickEditMode(false);
    }
  }
}

function handleContentModeEnabled(snapshot: ContentModeDisabledSnapshot, mode: string) {
  if (mode === 'quick-edit' && !snapshot.quickEditMode) {
    snapshot.setQuickEditMode(true);
  }
}

export function useModeDisabledListener({
  aiPickMode,
  highlighterMode,
  quickEditMode,
  setAiPickMode,
  setHighlighterMode,
  setQuickEditDocumentMode,
  setQuickEditMode,
}: UseModeDisabledListenerParams): void {
  const snapshotRef = useRef<ContentModeDisabledSnapshot>({
    aiPickMode,
    highlighterMode,
    quickEditMode,
    setAiPickMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
  });

  snapshotRef.current = {
    aiPickMode,
    highlighterMode,
    quickEditMode,
    setAiPickMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
  };

  useEffect(() => {
    const removeDisabledListener = addContentModeDisabledListener(({ mode }) => {
      handleContentModeDisabled(snapshotRef.current, mode);
    });
    const removeEnabledListener = addContentModeEnabledListener(({ mode }) => {
      handleContentModeEnabled(snapshotRef.current, mode);
    });

    return () => {
      removeDisabledListener();
      removeEnabledListener();
    };
  }, []);
}
