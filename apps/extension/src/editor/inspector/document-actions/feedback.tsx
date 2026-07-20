import { useEffect, useRef, useState, type MutableRefObject } from 'react';

export type AsyncFeedbackStatus = 'idle' | 'saved' | 'saving';

function clearFeedbackTimeout(timeoutRef: MutableRefObject<number | null>) {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function useClearFeedbackTimeoutOnUnmount(timeoutRef: MutableRefObject<number | null>) {
  useEffect(() => () => clearFeedbackTimeout(timeoutRef), [timeoutRef]);
}

export function useDocumentActionFeedback() {
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<Exclude<AsyncFeedbackStatus, 'idle'> | null>(
    null
  );
  const timeoutRef = useRef<number | null>(null);

  useClearFeedbackTimeoutOnUnmount(timeoutRef);

  async function runActionFeedback(
    actionId: string,
    action: () => Promise<void> | void
  ): Promise<void> {
    clearFeedbackTimeout(timeoutRef);

    setFeedbackActionId(actionId);
    setFeedbackStatus('saving');

    try {
      await Promise.resolve(action());
      setFeedbackStatus('saved');
      timeoutRef.current = window.setTimeout(() => {
        setFeedbackActionId(null);
        setFeedbackStatus(null);
        timeoutRef.current = null;
      }, 1600);
    } catch (error) {
      setFeedbackActionId(null);
      setFeedbackStatus(null);
      throw error;
    }
  }

  function getActionStatus(actionId: string): AsyncFeedbackStatus {
    if (feedbackActionId !== actionId || feedbackStatus === null) {
      return 'idle';
    }

    return feedbackStatus;
  }

  return {
    feedbackActionId,
    feedbackStatus,
    getActionStatus,
    runActionFeedback,
  };
}

export function resolvePresetFeedbackState(
  feedbackActionId: string | null,
  feedbackStatus: Exclude<AsyncFeedbackStatus, 'idle'> | null
) {
  if (!feedbackActionId?.startsWith('save-to-folder:')) {
    return {
      feedbackPresetId: null,
      savingPresetId: null,
    };
  }

  const presetId = feedbackActionId.replace('save-to-folder:', '');

  return {
    feedbackPresetId: feedbackStatus === 'saved' ? presetId : null,
    savingPresetId: feedbackStatus === 'saving' ? presetId : null,
  };
}
