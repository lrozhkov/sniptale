import { useCallback, useRef } from 'react';
import { applyAutoStepBadgeValues } from './auto-values';
import { createHistoryWrappedStepBadgeActions } from './actions-runtime';
import type {
  FrameManagerRefs,
  FrameSetter,
  RecalculateStepBadges,
  ReorderStepBadge,
  UpdateFrameStepBadge,
  UpdateGlobalStepBadgeSettings,
  WithHistoryCommit,
} from '../types';

export function useStepBadgeControllers(
  setFrames: FrameSetter,
  refs: FrameManagerRefs,
  withHistoryCommit: WithHistoryCommit
): {
  recalculateStepBadges: RecalculateStepBadges;
  recalculateStepBadgesRef: React.MutableRefObject<RecalculateStepBadges>;
  reorderStepBadge: ReorderStepBadge;
  updateFrameStepBadge: UpdateFrameStepBadge;
  updateGlobalStepBadgeSettings: UpdateGlobalStepBadgeSettings;
} {
  const { stepBadgeOrderRef, sessionStepBadgeTemplateRef, globalStepBadgeSettingsRef } = refs;

  const recalculateStepBadges = useCallback<RecalculateStepBadges>(
    (excludeFrameId?: string) => {
      setFrames((prev) =>
        applyAutoStepBadgeValues(prev, stepBadgeOrderRef.current, excludeFrameId)
      );
    },
    [setFrames, stepBadgeOrderRef]
  );

  const recalculateStepBadgesRef = useRef<RecalculateStepBadges>(recalculateStepBadges);
  recalculateStepBadgesRef.current = recalculateStepBadges;
  const { reorderStepBadge, updateFrameStepBadge, updateGlobalStepBadgeSettings } =
    createHistoryWrappedStepBadgeActions({
      globalStepBadgeSettingsRef,
      recalculateStepBadges,
      recalculateStepBadgesRef,
      sessionStepBadgeTemplateRef,
      setFrames,
      stepBadgeOrderRef,
      withHistoryCommit,
    });

  return {
    recalculateStepBadges,
    recalculateStepBadgesRef,
    reorderStepBadge,
    updateFrameStepBadge,
    updateGlobalStepBadgeSettings,
  };
}
