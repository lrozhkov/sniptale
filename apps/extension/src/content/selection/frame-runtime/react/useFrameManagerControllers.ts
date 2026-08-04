import { useCallback, useMemo } from 'react';
import type { EffectMode, FrameData } from '../../../../features/highlighter/contracts';
import type { InteractiveFrameComponent } from '../roots/component';
import type {
  FrameManagerRefs,
  FrameSetter,
  FrameStateSetter,
  WithHistoryCommit,
} from '../contracts';
import { useFrameManagerMutations } from './useFrameManagerMutations';
import { useFrameManagerPublicResult } from './useFrameManagerPublicResult';
import { useFrameManagerRuntimeSyncEffects } from './useFrameManagerRuntimeSyncEffects';
import { useFrameManagerSessionEffects } from './useFrameManagerSessionEffects';
import { useStepBadgeControllers } from '../manager/step-badge/controllers';
import { getFrameSessionBorderPreset } from '../session/border-preset';
import { createSessionCalloutSettings } from '../session/callout-defaults';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getFutureFrameCallout, setFutureFrameCallout } from '../session/future-callout';

/**
 * Builds the internal frame manager controllers and side effects.
 */
export function useFrameManagerControllers(params: {
  frames: FrameData[];
  InteractiveFrameComponent: InteractiveFrameComponent;
  setFrames: FrameSetter;
  setFrameStates: FrameStateSetter;
  refs: FrameManagerRefs;
  withHistoryCommit: WithHistoryCommit;
}) {
  const { frames, InteractiveFrameComponent, setFrames, setFrameStates, refs, withHistoryCommit } =
    params;
  const {
    recalculateStepBadges,
    recalculateStepBadgesRef,
    updateFrameStepBadge,
    updateGlobalStepBadgeSettings,
    reorderStepBadge,
  } = useStepBadgeControllers(setFrames, refs, withHistoryCommit);
  const { mutations, hasFrameForElement } = useFrameManagerMutations(
    setFrames,
    refs,
    recalculateStepBadgesRef
  );
  const getGlobalStepBadgeSettings = useGlobalStepBadgeSettingsGetter(refs);
  const frameSessionStyle = useFrameSessionStyle(refs);

  useFrameManagerOwnedEffects({
    frames,
    InteractiveFrameComponent,
    mutations,
    refs,
    reorderStepBadge,
    setFrameStates,
    setFrames,
    updateFrameStepBadge,
    updateGlobalStepBadgeSettings,
    withHistoryCommit,
  });

  return useOwnedFrameManagerPublicResult({
    frames,
    frameSessionStyle,
    getGlobalStepBadgeSettings,
    hasFrameForElement,
    mutations,
    recalculateStepBadges,
    updateFrameStepBadge,
    updateGlobalStepBadgeSettings,
  });
}

function useOwnedFrameManagerPublicResult(args: {
  frames: FrameData[];
  frameSessionStyle: ReturnType<typeof useFrameSessionStyle>;
  getGlobalStepBadgeSettings: () => FrameManagerRefs['globalStepBadgeSettingsRef']['current'];
  hasFrameForElement: ReturnType<typeof useFrameManagerMutations>['hasFrameForElement'];
  mutations: ReturnType<typeof useFrameManagerMutations>['mutations'];
  recalculateStepBadges: ReturnType<typeof useStepBadgeControllers>['recalculateStepBadges'];
  updateFrameStepBadge: ReturnType<typeof useStepBadgeControllers>['updateFrameStepBadge'];
  updateGlobalStepBadgeSettings: ReturnType<
    typeof useStepBadgeControllers
  >['updateGlobalStepBadgeSettings'];
}) {
  return useFrameManagerPublicResult({
    addAutoBlurFrames: args.mutations.addAutoBlurFrames,
    addFrame: args.mutations.addFrame,
    addFreeFrame: args.mutations.addFreeFrame,
    clearAutoBlurFrames: args.mutations.clearAutoBlurFrames,
    clearFrames: args.mutations.clearFrames,
    frames: args.frames,
    getFutureFrameStyle: args.frameSessionStyle.getFutureFrameStyle,
    hasFrameForElement: args.hasFrameForElement,
    getGlobalStepBadgeSettings: args.getGlobalStepBadgeSettings,
    updateFrameStepBadge: args.updateFrameStepBadge,
    updateGlobalStepBadgeSettings: args.updateGlobalStepBadgeSettings,
    recalculateStepBadges: args.recalculateStepBadges,
    removeFrame: args.mutations.removeFrame,
    syncFocusOpacity: args.mutations.syncFocusOpacity,
    syncAutoBlurFrames: args.mutations.syncAutoBlurFrames,
    updateFrame: args.mutations.updateFrame,
    updateFrameEffect: args.mutations.updateFrameEffect,
    setFutureFrameEffectMode: args.frameSessionStyle.setFutureFrameEffectMode,
    futureFrameCallout: args.frameSessionStyle.futureFrameCallout,
  });
}

function useFrameSessionStyle(refs: FrameManagerRefs) {
  const getFutureFrameStyle = useCallback(
    () => ({
      effectMode: refs.globalEffectModeRef.current,
      borderSettings: getFrameSessionBorderPreset(),
      blurSettings: { ...refs.sessionSettingsRefs.blurSettings.current },
      focusSettings: { ...refs.sessionSettingsRefs.focusSettings.current },
      futureCallout: getFutureFrameCallout(),
    }),
    [refs.globalEffectModeRef, refs.sessionSettingsRefs]
  );
  const setFutureFrameEffectMode = useCallback(
    (mode: EffectMode) => {
      refs.globalEffectModeRef.current = mode;
      refs.sessionSettingsRefs.defaultsInitialized.current = true;
    },
    [refs.globalEffectModeRef, refs.sessionSettingsRefs]
  );

  const updateFutureFrameCallout = useCallback(
    (settings: CalloutSettings | null) => {
      setFutureFrameCallout(settings);
      if (settings) refs.sessionCalloutStyleRef.current = structuredClone(settings.style);
    },
    [refs.sessionCalloutStyleRef]
  );
  const enableFutureFrameCallout = useCallback(() => {
    const settings = createSessionCalloutSettings(refs.sessionCalloutStyleRef.current);
    setFutureFrameCallout(settings);
    return settings;
  }, [refs.sessionCalloutStyleRef]);
  const futureFrameCallout = useMemo(
    () => ({ enable: enableFutureFrameCallout, set: updateFutureFrameCallout }),
    [enableFutureFrameCallout, updateFutureFrameCallout]
  );

  return {
    futureFrameCallout,
    getFutureFrameStyle,
    setFutureFrameEffectMode,
  };
}

function useGlobalStepBadgeSettingsGetter(refs: FrameManagerRefs) {
  return useCallback(
    () => refs.globalStepBadgeSettingsRef.current,
    [refs.globalStepBadgeSettingsRef]
  );
}

function useFrameManagerOwnedEffects(args: {
  frames: FrameData[];
  InteractiveFrameComponent: InteractiveFrameComponent;
  mutations: ReturnType<typeof useFrameManagerMutations>['mutations'];
  refs: FrameManagerRefs;
  reorderStepBadge: ReturnType<typeof useStepBadgeControllers>['reorderStepBadge'];
  setFrameStates: FrameStateSetter;
  setFrames: FrameSetter;
  updateFrameStepBadge: ReturnType<typeof useStepBadgeControllers>['updateFrameStepBadge'];
  updateGlobalStepBadgeSettings: ReturnType<
    typeof useStepBadgeControllers
  >['updateGlobalStepBadgeSettings'];
  withHistoryCommit: WithHistoryCommit;
}) {
  useFrameManagerSessionEffects({
    refs: args.refs,
    reorderStepBadge: args.reorderStepBadge,
    setFrames: args.setFrames,
    syncFocusOpacity: args.mutations.syncFocusOpacity,
    updateFrameStepBadge: args.updateFrameStepBadge,
    updateGlobalStepBadgeSettings: args.updateGlobalStepBadgeSettings,
    withHistoryCommit: args.withHistoryCommit,
  });
  useFrameManagerRuntimeSyncEffects({
    frames: args.frames,
    InteractiveFrameComponent: args.InteractiveFrameComponent,
    mutations: args.mutations,
    refs: args.refs,
    setFrameStates: args.setFrameStates,
    setFrames: args.setFrames,
    withHistoryCommit: args.withHistoryCommit,
  });
}
