import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import { setDefaultBorderPreset } from '../../../../composition/persistence/highlighter';
import {
  createFrameBlurHandlers,
  createFrameFocusHandlers,
  createFrameSettingsPresetHandler,
} from './helpers';

export function createFrameSettingsPopoverHandlers(args: {
  blurDebounceRef: { current: number | null };
  focusDebounceRef: { current: number | null };
  frameId: string;
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  onApplyToFrame: (settings: {
    borderSettings?: BorderPreset;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
  setLocalBlurSettings: (settings: BlurSettings) => void;
  setLocalFocusSettings: (settings: FocusSettings) => void;
  setSelectedPresetId: (presetId: string) => void;
}) {
  const handleSelectPreset = createFrameSettingsPresetHandler({
    onApplyToFrame: args.onApplyToFrame,
    setDefaultBorderPreset,
    setSelectedPresetId: args.setSelectedPresetId,
  });

  const blurHandlers = createFrameBlurHandlers({
    blurDebounceRef: args.blurDebounceRef,
    localBlurSettings: args.localBlurSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalBlurSettings: args.setLocalBlurSettings,
  });

  const focusHandlers = createFrameFocusHandlers({
    focusDebounceRef: args.focusDebounceRef,
    frameId: args.frameId,
    localFocusSettings: args.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalFocusSettings: args.setLocalFocusSettings,
  });

  return {
    handleSelectPreset,
    ...blurHandlers,
    ...focusHandlers,
  };
}
