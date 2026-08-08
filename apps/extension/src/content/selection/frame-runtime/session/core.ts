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
import { createStepBadgePresetSessionSync } from './step-badge-defaults';
import { setFutureFrameCallout } from './future-callout';
import { resetAnnotationTemplateSources } from './annotation-template-source';
import { ensureLinkedAnnotationTemplateCatalogsReady } from './linked-annotation-templates';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'FrameSessionSync' });

export type FrameSessionSyncArgs = {
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
  highlighterSettingsCacheRef: MutableRefObject<HighlighterSettings | null>;
  globalEffectModeRef: MutableRefObject<EffectMode>;
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionDefaultsInitializedRef: MutableRefObject<boolean>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
  sessionCalloutStyleRef: MutableRefObject<CalloutVisualStyle | null>;
  sessionStepBadgeTemplateRef?: MutableRefObject<StepBadgeSettings | null>;
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
  sessionStepBadgeTemplateRef,
  syncFocusOpacity,
  updateGlobalStepBadgeSettings,
  updateFrameStepBadge,
  reorderStepBadge,
  withHistoryCommit,
}: FrameSessionSyncArgs) {
  setFutureFrameCallout(null);
  resetAnnotationTemplateSources();
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
  void ensureLinkedAnnotationTemplateCatalogsReady().catch((error) =>
    logger.error('Failed to preload annotation template catalogs', error)
  );
  const cleanupWindowListeners = registerWindowListeners(windowListeners);
  const cleanupStorageListener = browserStorage.subscribeToChanges(handleStorageChanged);
  const cleanupCalloutPresetSync = createCalloutPresetSessionSync(sessionCalloutStyleRef);
  const cleanupStepBadgePresetSync = sessionStepBadgeTemplateRef
    ? createStepBadgePresetSessionSync(sessionStepBadgeTemplateRef)
    : () => undefined;

  const cleanupFrameSession = combineFrameSessionSyncCleanups({
    cleanupStorageListener,
    cleanupWindowListeners,
  });
  return () => {
    setFutureFrameCallout(null);
    resetAnnotationTemplateSources();
    cleanupFrameSession();
    cleanupCalloutPresetSync();
    cleanupStepBadgePresetSync();
  };
}

function registerWindowListeners(cleanups: Array<() => void>) {
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
