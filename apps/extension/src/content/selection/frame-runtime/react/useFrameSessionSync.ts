import { useEffect, useRef } from 'react';
import {
  type FrameSessionSyncArgs as UseFrameSessionSyncArgs,
  setupFrameSessionSyncListeners,
} from '../session/core';

export function useFrameSessionSync(args: UseFrameSessionSyncArgs): void {
  useFrameSessionSyncEffect(args);
}

function useFrameSessionSyncCallbackRefs(args: UseFrameSessionSyncArgs) {
  const setFramesRef = useRef(args.setFrames);
  const syncFocusOpacityRef = useRef(args.syncFocusOpacity);
  const updateGlobalStepBadgeSettingsRef = useRef(args.updateGlobalStepBadgeSettings);
  const updateFrameStepBadgeRef = useRef(args.updateFrameStepBadge);
  const reorderStepBadgeRef = useRef(args.reorderStepBadge);
  const withHistoryCommitRef = useRef(args.withHistoryCommit);
  const withHistoryCommitProxyRef = useRef<UseFrameSessionSyncArgs['withHistoryCommit']>(((
    action
  ) => withHistoryCommitRef.current(action)) as UseFrameSessionSyncArgs['withHistoryCommit']);
  const callbackRefsRef = useRef({
    reorderStepBadgeRef,
    setFramesRef,
    syncFocusOpacityRef,
    updateFrameStepBadgeRef,
    updateGlobalStepBadgeSettingsRef,
    withHistoryCommitProxy: withHistoryCommitProxyRef.current,
    withHistoryCommitRef,
  });

  setFramesRef.current = args.setFrames;
  syncFocusOpacityRef.current = args.syncFocusOpacity;
  updateGlobalStepBadgeSettingsRef.current = args.updateGlobalStepBadgeSettings;
  updateFrameStepBadgeRef.current = args.updateFrameStepBadge;
  reorderStepBadgeRef.current = args.reorderStepBadge;
  withHistoryCommitRef.current = args.withHistoryCommit;

  return callbackRefsRef.current;
}

function useFrameSessionSyncEffect(args: UseFrameSessionSyncArgs) {
  const {
    highlighterSettingsCacheRef,
    globalEffectModeRef,
    sessionBlurSettingsRef,
    sessionFocusSettingsRef,
    sessionCalloutStyleRef,
  } = args;
  const callbackRefs = useFrameSessionSyncCallbackRefs(args);

  useEffect(
    () =>
      setupFrameSessionSyncListeners({
        setFrames: (update) => callbackRefs.setFramesRef.current(update),
        highlighterSettingsCacheRef,
        globalEffectModeRef,
        sessionBlurSettingsRef,
        sessionFocusSettingsRef,
        sessionCalloutStyleRef,
        syncFocusOpacity: (sourceFrameId, newOpacity) =>
          callbackRefs.syncFocusOpacityRef.current(sourceFrameId, newOpacity),
        updateGlobalStepBadgeSettings: (settings) =>
          callbackRefs.updateGlobalStepBadgeSettingsRef.current(settings),
        updateFrameStepBadge: (frameId, settings) =>
          callbackRefs.updateFrameStepBadgeRef.current(frameId, settings),
        reorderStepBadge: (frameId, direction) =>
          callbackRefs.reorderStepBadgeRef.current(frameId, direction),
        withHistoryCommit: callbackRefs.withHistoryCommitProxy,
      }),
    [
      callbackRefs,
      globalEffectModeRef,
      highlighterSettingsCacheRef,
      sessionBlurSettingsRef,
      sessionCalloutStyleRef,
      sessionFocusSettingsRef,
    ]
  );
}
