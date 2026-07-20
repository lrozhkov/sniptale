import type { MutableRefObject } from 'react';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadHighlighterSettings } from '../../../../composition/persistence/highlighter';

const logger = createLogger({ namespace: 'ContentFrameSessionSync' });

export function createFrameSessionSettingsLoader(args: {
  globalEffectModeRef: MutableRefObject<EffectMode>;
  highlighterSettingsCacheRef: MutableRefObject<HighlighterSettings | null>;
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
}) {
  return () => {
    loadHighlighterSettings()
      .then((settings) => {
        args.highlighterSettingsCacheRef.current = settings;
        args.globalEffectModeRef.current = settings.defaultEffectMode || 'border';
        args.sessionBlurSettingsRef.current = { ...settings.defaultBlurSettings };
        args.sessionFocusSettingsRef.current = { ...settings.defaultFocusSettings };
      })
      .catch((err) => {
        logger.error('Failed to load highlighter settings', err);
      });
  };
}

export function createFrameSessionStorageChangedHandler(loadSettings: () => void) {
  return (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName === 'sync' && changes['sniptale_highlighter_settings']) {
      loadSettings();
    }
  };
}

export function combineFrameSessionSyncCleanups(args: {
  cleanupStorageListener: () => void;
  cleanupWindowListeners: () => void;
}) {
  return () => {
    args.cleanupWindowListeners();
    args.cleanupStorageListener();
  };
}
