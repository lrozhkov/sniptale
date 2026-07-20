import { useEffect, useMemo, useState } from 'react';
import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from '../roots/component';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  createHistoryWrappedFrameManager,
  useHistoryCommitCoordinator,
} from './useFrameHistoryCommit';
import { createPagePreparationHistoryBridge } from '../history/bridge';
import { syncFrameManagerStateRefs, useFrameManagerRefs } from './useFrameManagerRefs';
import { useFrameManagerControllers } from './useFrameManagerControllers';

/**
 * Manages frame overlay state and delegates orchestration to focused controller hooks.
 */
export const useFrameManager = (params: {
  InteractiveFrameComponent: InteractiveFrameComponent;
}) => {
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [frameStates, setFrameStates] = useState<Map<string, FrameState>>(new Map());
  const refs = useFrameManagerRefs();

  syncFrameManagerStateRefs(frames, frameStates, refs);
  const withHistoryCommit = useHistoryCommitCoordinator(frames);
  const frameManager = useFrameManagerControllers({
    frames,
    InteractiveFrameComponent: params.InteractiveFrameComponent,
    setFrames,
    setFrameStates,
    refs,
    withHistoryCommit,
  });
  const historyBridge = useMemo(
    () =>
      createPagePreparationHistoryBridge({
        refs,
        setFrames,
        setFrameStates,
      }),
    [refs, setFrames, setFrameStates]
  );

  useEffect(() => {
    pagePreparationHistory.registerBridge(historyBridge);
    return () => {
      pagePreparationHistory.unregisterBridge(historyBridge);
    };
  }, [historyBridge]);

  return useMemo(
    () => createHistoryWrappedFrameManager(frameManager, withHistoryCommit),
    [frameManager, withHistoryCommit]
  );
};
