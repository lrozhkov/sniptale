import type {
  BlurSettings,
  BorderPreset,
  FocusSettings,
} from '../../../../features/highlighter/contracts';
import { useFrameSettingsPopoverBindings } from './bindings';
import { createFrameSettingsPopoverStateResult } from './result';
import { useFrameSettingsPopoverValues } from './values';

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

function createFrameSettingsPopoverBindingArgs(
  args: FrameSettingsPopoverStateArgs,
  values: ReturnType<typeof useFrameSettingsPopoverValues>
) {
  return {
    frameId: args.frameId,
    isOpen: args.isOpen,
    localBlurSettings: values.localBlurSettings,
    localFocusSettings: values.localFocusSettings,
    onApplyToFrame: args.onApplyToFrame,
    setGlobalSettings: values.setGlobalSettings,
    setLocalBlurSettings: values.setLocalBlurSettings,
    setLocalFocusSettings: values.setLocalFocusSettings,
    setSelectedPresetId: values.setSelectedPresetId,
    ...(args.blurSettings === undefined ? {} : { blurSettings: args.blurSettings }),
    ...(args.borderSettings === undefined ? {} : { borderSettings: args.borderSettings }),
    ...(args.focusSettings === undefined ? {} : { focusSettings: args.focusSettings }),
  };
}

export function useFrameSettingsPopoverState(args: FrameSettingsPopoverStateArgs) {
  const values = useFrameSettingsPopoverValues();

  const {
    handleBlurChange,
    handleBlurShowBorderChange,
    handleBlurTypeChange,
    handleFocusChange,
    handleFocusShowBorderChange,
    handleSelectPreset,
  } = useFrameSettingsPopoverBindings(createFrameSettingsPopoverBindingArgs(args, values));

  return createFrameSettingsPopoverStateResult({
    globalSettings: values.globalSettings,
    handleBlurChange,
    handleBlurShowBorderChange,
    handleBlurTypeChange,
    handleFocusChange,
    handleFocusShowBorderChange,
    handleSelectPreset,
    localBlurSettings: values.localBlurSettings,
    localFocusSettings: values.localFocusSettings,
    selectedPresetId: values.selectedPresetId,
  });
}
