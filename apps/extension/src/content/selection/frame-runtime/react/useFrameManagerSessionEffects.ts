import { useFrameSessionSync } from './useFrameSessionSync';
import type {
  FrameManagerRefs,
  FrameMutations,
  FrameSetter,
  ReorderStepBadge,
  UpdateFrameStepBadge,
  UpdateGlobalStepBadgeSettings,
  WithHistoryCommit,
} from '../manager/types';

export function useFrameManagerSessionEffects(params: {
  setFrames: FrameSetter;
  refs: FrameManagerRefs;
  syncFocusOpacity: FrameMutations['syncFocusOpacity'];
  updateFrameStepBadge: UpdateFrameStepBadge;
  updateGlobalStepBadgeSettings: UpdateGlobalStepBadgeSettings;
  reorderStepBadge: ReorderStepBadge;
  withHistoryCommit: WithHistoryCommit;
}) {
  const {
    setFrames,
    refs,
    syncFocusOpacity,
    updateFrameStepBadge,
    updateGlobalStepBadgeSettings,
    reorderStepBadge,
    withHistoryCommit,
  } = params;

  useFrameSessionSync({
    setFrames,
    highlighterSettingsCacheRef: refs.highlighterSettingsCacheRef,
    globalEffectModeRef: refs.globalEffectModeRef,
    sessionBlurSettingsRef: refs.sessionBlurSettingsRef,
    sessionFocusSettingsRef: refs.sessionFocusSettingsRef,
    sessionCalloutStyleRef: refs.sessionCalloutStyleRef,
    syncFocusOpacity,
    updateGlobalStepBadgeSettings,
    updateFrameStepBadge,
    reorderStepBadge,
    withHistoryCommit,
  });
}
