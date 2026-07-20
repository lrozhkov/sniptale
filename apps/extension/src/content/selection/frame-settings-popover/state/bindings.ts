import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { createFrameSettingsPopoverHandlers } from './handlers';
import { useFrameSettingsPopoverEffects, useFrameSettingsPopoverRefs } from './refs';

function createLocalSettingsSetters(args: {
  localBlurSettingsDirtyRef: { current: boolean };
  localFocusSettingsDirtyRef: { current: boolean };
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
}) {
  return {
    setLocalBlurSettingsFromUser: (settings: BlurSettings) => {
      args.localBlurSettingsDirtyRef.current = true;
      args.setLocalBlurSettings(settings);
    },
    setLocalFocusSettingsFromUser: (settings: FocusSettings) => {
      args.localFocusSettingsDirtyRef.current = true;
      args.setLocalFocusSettings(settings);
    },
  };
}

export function useFrameSettingsPopoverBindings(args: {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  onApplyToFrame: (settings: {
    borderSettings?: BorderPreset;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
  setGlobalSettings: (settings: HighlighterSettings) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  setSelectedPresetId: (presetId: string) => void;
}) {
  const refs = useFrameSettingsPopoverRefs(args);
  const localSettingsSetters = createLocalSettingsSetters({
    localBlurSettingsDirtyRef: refs.localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef: refs.localFocusSettingsDirtyRef,
    setLocalBlurSettings: args.setLocalBlurSettings,
    setLocalFocusSettings: args.setLocalFocusSettings,
  });

  useFrameSettingsPopoverEffects({
    ...refs,
    frameId: args.frameId,
    isOpen: args.isOpen,
    setGlobalSettings: args.setGlobalSettings,
    setLocalBlurSettings: args.setLocalBlurSettings,
    setLocalFocusSettings: args.setLocalFocusSettings,
    setSelectedPresetId: args.setSelectedPresetId,
  });

  return createFrameSettingsPopoverHandlers({
    blurDebounceRef: refs.blurDebounceRef,
    focusDebounceRef: refs.focusDebounceRef,
    frameId: args.frameId,
    localBlurSettings: args.localBlurSettings,
    localFocusSettings: args.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalBlurSettings: localSettingsSetters.setLocalBlurSettingsFromUser,
    setLocalFocusSettings: localSettingsSetters.setLocalFocusSettingsFromUser,
    setSelectedPresetId: args.setSelectedPresetId,
  });
}
