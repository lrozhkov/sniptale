import { useFrameSettingsPopoverController } from './controller';
import { FrameSettingsPopoverSurface } from './surface';
import type { FrameSettingsPopoverBodyProps, FrameSettingsPopoverSurfaceProps } from './types';

function createFrameSettingsPopoverSurfaceProps(
  props: FrameSettingsPopoverBodyProps,
  state: ReturnType<typeof useFrameSettingsPopoverController>
): FrameSettingsPopoverSurfaceProps {
  return {
    anchorEl: props.anchorEl,
    effectMode: props.effectMode,
    frameId: props.frameId,
    getPopoverStyle: state.getPopoverStyle,
    globalSettings: state.globalSettings,
    handleBlurChange: state.handleBlurChange,
    handleBlurShowBorderChange: state.handleBlurShowBorderChange,
    handleBlurTypeChange: state.handleBlurTypeChange,
    handleFocusChange: state.handleFocusChange,
    handleFocusShowBorderChange: state.handleFocusShowBorderChange,
    handleSelectPreset: state.handleSelectPresetAndClose,
    localBlurSettings: state.localBlurSettings,
    localFocusSettings: state.localFocusSettings,
    popoverRef: state.popoverRef,
    portalTheme: state.portalTheme,
    selectedPresetId: state.selectedPresetId,
  };
}

export function FrameSettingsPopoverBody(props: FrameSettingsPopoverBodyProps) {
  const state = useFrameSettingsPopoverController(props);

  if (!props.isOpen) {
    return null;
  }

  return <FrameSettingsPopoverSurface {...createFrameSettingsPopoverSurfaceProps(props, state)} />;
}
