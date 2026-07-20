import { createUpdateFrameStepBadge, createUpdateGlobalStepBadgeSettings } from './update';
import { createReorderStepBadge } from './reorder';
import type {
  FrameManagerRefs,
  FrameSetter,
  RecalculateStepBadges,
  WithHistoryCommit,
} from '../types';

export function createHistoryWrappedStepBadgeActions(args: {
  globalStepBadgeSettingsRef: FrameManagerRefs['globalStepBadgeSettingsRef'];
  recalculateStepBadges: RecalculateStepBadges;
  recalculateStepBadgesRef: React.MutableRefObject<RecalculateStepBadges>;
  sessionStepBadgeTemplateRef: FrameManagerRefs['sessionStepBadgeTemplateRef'];
  setFrames: FrameSetter;
  stepBadgeOrderRef: FrameManagerRefs['stepBadgeOrderRef'];
  withHistoryCommit: WithHistoryCommit;
}) {
  return {
    updateFrameStepBadge: args.withHistoryCommit(
      createUpdateFrameStepBadge({
        globalStepBadgeSettingsRef: args.globalStepBadgeSettingsRef,
        recalculateStepBadgesRef: args.recalculateStepBadgesRef,
        sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
        setFrames: args.setFrames,
      })
    ),
    updateGlobalStepBadgeSettings: args.withHistoryCommit(
      createUpdateGlobalStepBadgeSettings({
        globalStepBadgeSettingsRef: args.globalStepBadgeSettingsRef,
        recalculateStepBadges: args.recalculateStepBadges,
      })
    ),
    reorderStepBadge: args.withHistoryCommit(
      createReorderStepBadge({
        recalculateStepBadgesRef: args.recalculateStepBadgesRef,
        setFrames: args.setFrames,
        stepBadgeOrderRef: args.stepBadgeOrderRef,
      })
    ),
  };
}
