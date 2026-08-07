import type { MutableRefObject } from 'react';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadHighlighterSettings } from '../../../../composition/persistence/highlighter';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { initializeFrameSessionBorderPreset } from './border-preset';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';

const logger = createLogger({ namespace: 'ContentFrameSessionSync' });

export function createFrameSessionSettingsLoader(args: {
  globalEffectModeRef: MutableRefObject<EffectMode>;
  highlighterSettingsCacheRef: MutableRefObject<HighlighterSettings | null>;
  sessionBlurSettingsRef: MutableRefObject<BlurSettings>;
  sessionDefaultsInitializedRef: MutableRefObject<boolean>;
  sessionFocusSettingsRef: MutableRefObject<FocusSettings>;
}) {
  let requestRevision = 0;

  return () => {
    const currentRevision = ++requestRevision;
    loadHighlighterSettings()
      .then((settings) => {
        if (currentRevision !== requestRevision) {
          return;
        }

        args.highlighterSettingsCacheRef.current = settings;
        const persistedPreset = settings.borderPresets.find(
          (preset) => preset.id === settings.defaultBorderPresetId
        );
        initializeFrameSessionBorderPreset(persistedPreset ?? DEFAULT_BORDER_PRESET);
        if (args.sessionDefaultsInitializedRef.current) {
          return;
        }

        args.globalEffectModeRef.current = settings.defaultEffectMode || 'border';
        const effects = cloneBorderPresetEffects(persistedPreset?.effects);
        args.sessionBlurSettingsRef.current = {
          ...settings.defaultBlurSettings,
          ...effects.blur,
          showBorder: true,
        };
        args.sessionFocusSettingsRef.current = {
          ...settings.defaultFocusSettings,
          blurAmount: effects.focus.blurAmount,
          opacity: effects.focus.opacity,
          showBorder: true,
        };
        args.sessionDefaultsInitializedRef.current = true;
      })
      .catch((err) => {
        if (currentRevision === requestRevision) {
          logger.error('Failed to load highlighter settings', err);
        }
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
