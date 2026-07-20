import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import type {
  BlurSettings,
  CalloutSettings,
  EffectMode,
  FocusSettings,
  FrameData,
  GlobalStepBadgeSettings,
  HighlighterSettings,
  StepBadgeSettings,
} from '../../../../features/highlighter/contracts';
import type { WithHistoryCommit } from '../manager/types';
import { buildFrameSessionWindowListeners } from './events';
import {
  combineFrameSessionSyncCleanups,
  createFrameSessionSettingsLoader,
  createFrameSessionStorageChangedHandler,
} from './settings';

export type FrameSessionSyncArgs = {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  highlighterSettingsCacheRef: MutableRefObject<HighlighterSettings | null>;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
  sessionCalloutStyleRef: MutableRefObject<Partial<CalloutSettings> | null>;
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
  sessionFocusSettingsRef,
  sessionCalloutStyleRef,
  syncFocusOpacity,
  updateGlobalStepBadgeSettings,
  updateFrameStepBadge,
  reorderStepBadge,
  withHistoryCommit,
}: FrameSessionSyncArgs) {
  const loadSettings = createFrameSessionSettingsLoader({
    globalEffectModeRef,
    highlighterSettingsCacheRef,
    sessionBlurSettingsRef,
    sessionFocusSettingsRef,
  });
  const handleStorageChanged = createFrameSessionStorageChangedHandler(loadSettings);
  const windowListeners = buildFrameSessionWindowListeners({
    highlighterSettingsCacheRef,
    loadSettings,
    syncFocusOpacity,
    sessionBlurSettingsRef,
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

  return combineFrameSessionSyncCleanups({
    cleanupStorageListener,
    cleanupWindowListeners,
  });
}

function registerWindowListeners(cleanups: Array<() => void>) {
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
