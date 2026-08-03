import type {
  BlurSettings,
  BlurType,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import {
  dispatchFocusOpacityChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
} from '../../../platform/page-context/frame-events';
import { setFrameSessionBorderPreset } from '../../frame-runtime/session/border-preset';

const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  opacity: 0.5,
  showBorder: false,
};
export function getDefaultFocusSettings(): FocusSettings {
  return { ...DEFAULT_FOCUS_SETTINGS };
}

export function createFrameSettingsPresetHandler(args: {
  onApplyToFrame: (settings: { borderSettings?: BorderPreset }) => void;
  setSelectedPresetId: (presetId: string) => void;
}) {
  return (preset: BorderPreset): void => {
    args.setSelectedPresetId(preset.id);
    const sessionPreset = { ...preset, padding: { ...preset.padding } };
    args.onApplyToFrame({ borderSettings: sessionPreset });
    setFrameSessionBorderPreset(sessionPreset);
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
  frameId?: string;
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
      if (args.frameId !== undefined) {
        dispatchFocusOpacityChanged({
          frameId: args.frameId,
          opacity,
        });
      }
    },
    handleFocusShowBorderChange: (showBorder: boolean) => {
      const nextSettings = { ...args.localFocusSettings, showBorder };
      args.setLocalFocusSettings(nextSettings);
      applyFocusSettings(nextSettings);
    },
  };
}
