import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  HighlighterSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import type { WithHistoryCommit } from '../contracts';
import { buildFrameSessionWindowListeners } from './events';
import {
  combineFrameSessionSyncCleanups,
  createFrameSessionSettingsLoader,
  createFrameSessionStorageChangedHandler,
} from './settings';
import { createCalloutPresetSessionSync } from './callout-defaults';
import { setFutureFrameCallout } from './future-callout';

export type FrameSessionSyncArgs = {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  highlighterSettingsCacheRef: MutableRefObject<HighlighterSettings | null>;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionDefaultsInitializedRef: MutableRefObject<boolean>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
  sessionCalloutStyleRef: MutableRefObject<CalloutVisualStyle | null>;
  syncFocusOpacity: (sourceFrameId: string, newOpacity: number) => void;
  updateGlobalStepBadgeSettings: (settings: Partial<GlobalStepBadgeSettings>) => void;
  updateFrameStepBadge: (frameId: string, settings: Partial<StepBadgeSettings>) => void;
  reorderStepBadge: (frameId: string, direction: 'up' | 'down') => void;
  withHistoryCommit: WithHistoryCommit;
};

export function setupFrameSessionSyncListeners({
  setFrames,
  highlighterSettingsCacheRef,
  globalEffectModeRef,
  sessionBlurSettingsRef,
  sessionDefaultsInitializedRef,
  sessionFocusSettingsRef,
  sessionCalloutStyleRef,
  syncFocusOpacity,
  updateGlobalStepBadgeSettings,
  updateFrameStepBadge,
  reorderStepBadge,
  withHistoryCommit,
}: FrameSessionSyncArgs) {
  setFutureFrameCallout(null);
  const loadSettings = createFrameSessionSettingsLoader({
    globalEffectModeRef,
    highlighterSettingsCacheRef,
    sessionBlurSettingsRef,
    sessionDefaultsInitializedRef,
    sessionFocusSettingsRef,
  });
  const handleStorageChanged = createFrameSessionStorageChangedHandler(loadSettings);
  const windowListeners = buildFrameSessionWindowListeners({
    syncFocusOpacity,
    sessionBlurSettingsRef,
    sessionDefaultsInitializedRef,
    sessionFocusSettingsRef,
    updateGlobalStepBadgeSettings,
    updateFrameStepBadge,
    reorderStepBadge,
    withHistoryCommit,
    setFrames,
    sessionCalloutStyleRef,
  });

  loadSettings();
  const cleanupWindowListeners = registerWindowListeners(windowListeners);
  const cleanupStorageListener = browserStorage.subscribeToChanges(handleStorageChanged);
  const cleanupCalloutPresetSync = createCalloutPresetSessionSync(sessionCalloutStyleRef);

  const cleanupFrameSession = combineFrameSessionSyncCleanups({
    cleanupStorageListener,
    cleanupWindowListeners,
  });
  return () => {
    setFutureFrameCallout(null);
    cleanupFrameSession();
    cleanupCalloutPresetSync();
  };
}

function registerWindowListeners(cleanups: Array<() => void>) {
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
