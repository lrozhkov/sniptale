import type { FrameSettingsPopoverStateResult } from '../types';

export function createFrameSettingsPopoverStateResult(args: FrameSettingsPopoverStateResult) {
  return {
    globalSettings: args.globalSettings,
    handleBlurChange: args.handleBlurChange,
    handleBlurShowBorderChange: args.handleBlurShowBorderChange,
    handleBlurTypeChange: args.handleBlurTypeChange,
    handleFocusChange: args.handleFocusChange,
    handleFocusShowBorderChange: args.handleFocusShowBorderChange,
    handleSelectPreset: args.handleSelectPreset,
    localBlurSettings: args.localBlurSettings,
    localFocusSettings: args.localFocusSettings,
    selectedPresetId: args.selectedPresetId,
  };
}
