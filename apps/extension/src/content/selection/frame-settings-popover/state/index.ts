import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import {
  createFrameBlurHandlers,
  createFrameFocusHandlers,
  createFrameSettingsPresetHandler,
} from './helpers';
import { useFrameSettingsPopoverLifecycle } from './lifecycle';

type FrameSettingsPopoverStateArgs = {
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
  onApplyToFrame: (settings: {
    borderSettings?: BorderPreset;
    blurSettings?: BlurSettings;
    focusSettings?: FocusSettings;
  }) => void;
};

export function useFrameSettingsPopoverState(args: FrameSettingsPopoverStateArgs) {
  const session = useFrameSettingsPopoverLifecycle({
    frameId: args.frameId,
    isOpen: args.isOpen,
    ...(args.blurSettings === undefined ? {} : { blurSettings: args.blurSettings }),
    ...(args.borderSettings === undefined ? {} : { borderSettings: args.borderSettings }),
    ...(args.focusSettings === undefined ? {} : { focusSettings: args.focusSettings }),
  });
  const handleSelectPreset = createFrameSettingsPresetHandler({
    onApplyToFrame: args.onApplyToFrame,
    setSelectedPresetId: session.selectPreset,
  });
  const blurHandlers = createFrameBlurHandlers({
    localBlurSettings: session.localBlurSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalBlurSettings: session.applyBlurSettingsFromUser,
  });
  const focusHandlers = createFrameFocusHandlers({
    frameId: args.frameId,
    localFocusSettings: session.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setLocalFocusSettings: session.applyFocusSettingsFromUser,
  });

  return {
    handlers: {
      handleBlurChange: blurHandlers.handleBlurChange,
      handleBlurShowBorderChange: blurHandlers.handleBlurShowBorderChange,
      handleBlurTypeChange: blurHandlers.handleBlurTypeChange,
      handleFocusChange: focusHandlers.handleFocusChange,
      handleFocusShowBorderChange: focusHandlers.handleFocusShowBorderChange,
      handleSelectPreset,
    },
    settings: {
      global: session.globalSettings,
      localBlur: session.localBlurSettings,
      localFocus: session.localFocusSettings,
      selectedPresetId: session.selectedPresetId,
    },
  };
}
