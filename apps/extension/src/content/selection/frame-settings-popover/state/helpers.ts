import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  BlurSettings,
  BlurType,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import {
  dispatchFocusOpacityChanged,
  dispatchHighlighterSettingsChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
} from '../../../platform/page-context/frame-events';

const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  opacity: 0.5,
  showBorder: false,
};
const logger = createLogger({ namespace: 'ContentFrameSettingsPopover' });

export type FrameSettingsPresetCommitOutcome = 'accepted' | 'rejected';

export function getDefaultFocusSettings(): FocusSettings {
  return { ...DEFAULT_FOCUS_SETTINGS };
}

export function createFrameSettingsPresetHandler(args: {
  onApplyToFrame: (settings: { borderSettings?: BorderPreset }) => void;
  setSelectedPresetId: (presetId: string) => void;
  setDefaultBorderPreset: (presetId: string) => Promise<void>;
}) {
  return async (preset: BorderPreset): Promise<FrameSettingsPresetCommitOutcome> => {
    args.setSelectedPresetId(preset.id);
    args.onApplyToFrame({ borderSettings: { ...preset } });

    try {
      await args.setDefaultBorderPreset(preset.id);
      dispatchHighlighterSettingsChanged({ defaultBorderPresetId: preset.id });
      return 'accepted';
    } catch (error) {
      logger.error('Failed to save default preset', error);
      return 'rejected';
    }
  };
}

export function createFrameBlurHandlers(args: {
  localBlurSettings: BlurSettings;
  onApplyToFrame: (settings: { blurSettings?: BlurSettings }) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
}) {
  const applyBlurSettings = (settings: BlurSettings) => {
    args.onApplyToFrame({ blurSettings: settings });
    dispatchSessionBlurSettingsChanged({ settings });
  };

  return {
    handleBlurChange: (amount: number) => {
      const nextSettings = { ...args.localBlurSettings, amount };
      args.setLocalBlurSettings(nextSettings);
      applyBlurSettings(nextSettings);
    },
    handleBlurShowBorderChange: (showBorder: boolean) => {
      const nextSettings = { ...args.localBlurSettings, showBorder };
      args.setLocalBlurSettings(nextSettings);
      applyBlurSettings(nextSettings);
    },
    handleBlurTypeChange: (blurType: BlurType) => {
      const nextSettings = { ...args.localBlurSettings, blurType };
      args.setLocalBlurSettings(nextSettings);
      applyBlurSettings(nextSettings);
    },
  };
}

export function createFrameFocusHandlers(args: {
  frameId: string;
  localFocusSettings: FocusSettings;
  onApplyToFrame: (settings: { focusSettings?: FocusSettings }) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
}) {
  const applyFocusSettings = (settings: FocusSettings) => {
    args.onApplyToFrame({ focusSettings: settings });
    dispatchSessionFocusSettingsChanged({ settings });
  };

  return {
    handleFocusChange: (opacity: number) => {
      const nextSettings = { ...args.localFocusSettings, opacity };
      args.setLocalFocusSettings(nextSettings);
      applyFocusSettings(nextSettings);
      dispatchFocusOpacityChanged({
        frameId: args.frameId,
        opacity,
      });
    },
    handleFocusShowBorderChange: (showBorder: boolean) => {
      const nextSettings = { ...args.localFocusSettings, showBorder };
      args.setLocalFocusSettings(nextSettings);
      applyFocusSettings(nextSettings);
    },
  };
}
