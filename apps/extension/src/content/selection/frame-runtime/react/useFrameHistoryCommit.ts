import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type { useFrameManagerControllers } from './useFrameManagerControllers';
import { createBrowserFrameAnnotationSync } from '../annotation';
import type { FrameMutableRef, FrameSetter } from '../contracts';

function throwFrameMutationFailure(error: unknown, rollbackFailures: Error[]): never {
  if (rollbackFailures.length > 0) {
    throw new AggregateError(
      [error instanceof Error ? error : new Error('Frame mutation failed'), ...rollbackFailures],
      'Frame mutation and compensation failed'
    );
  }
  throw error;
}

function rollbackFailedFrameMutation(args: {
  annotationRollbackPoint: ReturnType<
    typeof browserAnnotationSession.captureFailedMutationRollbackPoint
  >;
  beforeFrames: FrameData[];
  commitId: number | null;
  framesRef: FrameMutableRef<FrameData[]>;
  setFrames: FrameSetter;
}): Error[] {
  const failures: Error[] = [];
  if (args.commitId !== null) {
    try {
      pagePreparationHistory.cancelDeferredCommit(args.commitId);
    } catch (error) {
      failures.push(new Error('Frame deferred transaction cancellation failed', { cause: error }));
    }
  }

  try {
    args.framesRef.current = args.beforeFrames;
    args.setFrames(args.beforeFrames);
  } catch (error) {
    failures.push(new Error('Frame state rollback failed', { cause: error }));
  }

  try {
    if (!browserAnnotationSession.rollbackFailedMutation(args.annotationRollbackPoint)) {
      failures.push(new Error('Frame annotation-session rollback was refused'));
    }
  } catch (error) {
    failures.push(new Error('Frame annotation-session rollback threw', { cause: error }));
  }
  return failures;
}

function runWithFrameHistoryCommit<T extends (...args: never[]) => unknown>(args: {
  action: T;
  actionArgs: Parameters<T>;
  framesRef: FrameMutableRef<FrameData[]>;
  queueDeferredCommit: (commitId: number) => void;
  setFrames: FrameSetter;
}): ReturnType<T> {
  const hasExternalTransaction = pagePreparationHistory.hasOpenTransactions();
  const commitId = hasExternalTransaction ? null : pagePreparationHistory.beginDeferredCommit();
  if (!hasExternalTransaction && commitId === null) {
    throw new Error('Frame history transaction is unavailable');
  }
  const beforeFrames = args.framesRef.current;
  const annotationRollbackPoint = browserAnnotationSession.captureFailedMutationRollbackPoint();

  try {
    const result = args.action(...args.actionArgs);
    const annotationSync = createBrowserFrameAnnotationSync(beforeFrames, args.framesRef.current);
    browserAnnotationSession.syncFrames(annotationSync.inputs, annotationSync.updatedFrameIds);
    if (commitId !== null) {
      args.queueDeferredCommit(commitId);
    }
    return result as ReturnType<T>;
  } catch (error) {
    throwFrameMutationFailure(
      error,
      rollbackFailedFrameMutation({
        annotationRollbackPoint,
        beforeFrames,
        commitId,
        framesRef: args.framesRef,
        setFrames: args.setFrames,
      })
    );
  }
}

export function useHistoryCommitCoordinator(options: {
  framesRef: FrameMutableRef<FrameData[]>;
  setFrames: FrameSetter;
}) {
  const [historyCommitVersion, setHistoryCommitVersion] = useState(0);
  const pendingCommitIdsRef = useRef<number[]>([]);

  const queueDeferredCommit = useCallback((commitId: number) => {
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
  }, [historyCommitVersion]);

  return useCallback(
    <T extends (...args: never[]) => unknown>(action: T): T => {
      return ((...actionArgs: Parameters<T>) => {
        return runWithFrameHistoryCommit({
          action,
          actionArgs,
          framesRef: options.framesRef,
          queueDeferredCommit,
          setFrames: options.setFrames,
        });
      }) as T;
    },
    [options.framesRef, options.setFrames, queueDeferredCommit]
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
    addFreeFrame: withHistoryCommit(frameManager.addFreeFrame),
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
