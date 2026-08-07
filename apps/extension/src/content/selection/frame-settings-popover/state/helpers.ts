import type {
  AppliedBorderSettings,
  BlurSettings,
  BlurType,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import {
  dispatchFocusOpacityChanged,
  dispatchSessionBlurSettingsChanged,
  dispatchSessionFocusSettingsChanged,
} from '../../../platform/page-context/frame-events';
import { setFrameSessionBorderPreset } from '../../frame-runtime/session/border-preset';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';

const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  blurAmount: 0,
  opacity: 0.5,
  showBorder: true,
};
export function getDefaultFocusSettings(): FocusSettings {
  return { ...DEFAULT_FOCUS_SETTINGS };
}

export function createFrameSettingsPresetHandler(args: {
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  onApplyToFrame: (settings: {
    borderSettings?: AppliedBorderSettings;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
  setSelectedPreset: (settings: AppliedBorderSettings) => void;
  syncSessionDefaults: boolean;
}) {
  return (preset: BorderPreset): void => {
    const applied = projectBorderPresetToAppliedSettings(preset);
    const effects = cloneBorderPresetEffects(preset.effects);
    const blurSettings = {
      ...args.localBlurSettings,
      ...effects.blur,
      showBorder: true,
    };
    const focusSettings = {
      ...args.localFocusSettings,
      blurAmount: effects.focus.blurAmount,
      opacity: effects.focus.opacity,
      showBorder: true,
    };

    args.setSelectedPreset(applied);
    args.setLocalBlurSettings(blurSettings);
    args.setLocalFocusSettings(focusSettings);
    args.onApplyToFrame({
      borderSettings: applied,
      blurSettings,
      focusSettings,
    });
    if (args.syncSessionDefaults) {
      setFrameSessionBorderPreset(applied);
      dispatchSessionBlurSettingsChanged({ settings: blurSettings });
      dispatchSessionFocusSettingsChanged({ settings: focusSettings });
    }
  };
}

export function createFrameBlurHandlers(args: {
  localBlurSettings: BlurSettings;
  onApplyToFrame: (settings: { blurSettings?: BlurSettings }) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
  syncSessionDefaults: boolean;
}) {
  const applyBlurSettings = (settings: BlurSettings) => {
    args.onApplyToFrame({ blurSettings: settings });
    if (args.syncSessionDefaults) dispatchSessionBlurSettingsChanged({ settings });
  };

  return {
    applyBlurSettings: (settings: BlurSettings) => {
      args.setLocalBlurSettings(settings);
      applyBlurSettings(settings);
    },
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
  syncSessionDefaults: boolean;
}) {
  const applyFocusSettings = (settings: FocusSettings) => {
    args.onApplyToFrame({ focusSettings: settings });
    if (args.syncSessionDefaults) dispatchSessionFocusSettingsChanged({ settings });
  };

  return {
    applyFocusSettings: (settings: FocusSettings) => {
      args.setLocalFocusSettings(settings);
      applyFocusSettings(settings);
    },
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
    handleFocusBlurChange: (blurAmount: number) => {
      const nextSettings = { ...args.localFocusSettings, blurAmount };
      args.setLocalFocusSettings(nextSettings);
      applyFocusSettings(nextSettings);
    },
    handleFocusShowBorderChange: (showBorder: boolean) => {
      const nextSettings = { ...args.localFocusSettings, showBorder };
      args.setLocalFocusSettings(nextSettings);
      applyFocusSettings(nextSettings);
    },
  };
}
