import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type { useFrameManagerControllers } from './useFrameManagerControllers';

function runWithDeferredHistoryCommit<T extends (...args: never[]) => unknown>(
  action: T,
  args: Parameters<T>,
  queueDeferredCommit: (commitId: number | null) => void
): ReturnType<T> {
  const commitId = pagePreparationHistory.beginDeferredCommit();
  try {
    const result = action(...args);
    queueDeferredCommit(commitId);
    return result as ReturnType<T>;
  } catch (error) {
    if (commitId !== null) {
      pagePreparationHistory.cancelDeferredCommit(commitId);
    }

    throw error;
  }
}

export function useHistoryCommitCoordinator(frames: FrameData[]) {
  const [historyCommitVersion, setHistoryCommitVersion] = useState(0);
  const pendingCommitIdsRef = useRef<number[]>([]);

  const queueDeferredCommit = useCallback((commitId: number | null) => {
    if (commitId === null) {
      return;
    }

    pendingCommitIdsRef.current.push(commitId);
    setHistoryCommitVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (pendingCommitIdsRef.current.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const pendingCommitIds = pendingCommitIdsRef.current.splice(0);
      pendingCommitIds.forEach((commitId) => {
        pagePreparationHistory.finalizeDeferredCommit(commitId);
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [frames, historyCommitVersion]);

  return useCallback(
    <T extends (...args: never[]) => unknown>(action: T): T => {
      return ((...args: Parameters<T>) => {
        if (pagePreparationHistory.hasOpenTransactions()) {
          return action(...args);
        }

        return runWithDeferredHistoryCommit(action, args, queueDeferredCommit);
      }) as T;
    },
    [queueDeferredCommit]
  );
}

export function createHistoryWrappedFrameManager(
  frameManager: ReturnType<typeof useFrameManagerControllers>,
  withHistoryCommit: <T extends (...args: never[]) => unknown>(action: T) => T
) {
  return {
    ...frameManager,
    addAutoBlurFrames: withHistoryCommit(frameManager.addAutoBlurFrames),
    addFrame: withHistoryCommit(frameManager.addFrame),
    clearAutoBlurFrames: withHistoryCommit(frameManager.clearAutoBlurFrames),
    clearFrames: withHistoryCommit(frameManager.clearFrames),
    removeFrame: withHistoryCommit(frameManager.removeFrame),
    syncFocusOpacity: withHistoryCommit(frameManager.syncFocusOpacity),
    syncAutoBlurFrames: withHistoryCommit(frameManager.syncAutoBlurFrames),
    updateFrame: withHistoryCommit(frameManager.updateFrame),
    updateFrameEffect: withHistoryCommit(frameManager.updateFrameEffect),
    updateFrameStepBadge: frameManager.updateFrameStepBadge,
    updateGlobalStepBadgeSettings: frameManager.updateGlobalStepBadgeSettings,
  };
}
