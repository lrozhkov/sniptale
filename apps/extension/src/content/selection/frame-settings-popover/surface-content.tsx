import { FrameSettingsPopoverContent } from './views';
import type { FrameSettingsPopoverSurfaceContentProps } from './types';

export function FrameSettingsPopoverSurfaceContent(props: FrameSettingsPopoverSurfaceContentProps) {
  return (
    <FrameSettingsPopoverContent
      effectMode={props.effectMode}
      globalSettings={props.globalSettings}
      handleBlurChange={props.handleBlurChange}
      handleBlurShowBorderChange={props.handleBlurShowBorderChange}
      handleBlurTypeChange={props.handleBlurTypeChange}
      handleFocusChange={props.handleFocusChange}
      handleFocusShowBorderChange={props.handleFocusShowBorderChange}
      handleSelectPreset={props.handleSelectPreset}
      localBlurSettings={props.localBlurSettings}
      localFocusSettings={props.localFocusSettings}
      selectedPresetId={props.selectedPresetId}
    />
  );
}
