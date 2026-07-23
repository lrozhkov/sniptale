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
    getPopoverStyle: state.surface.getPopoverStyle,
    globalSettings: state.settings.global,
    handleBlurChange: state.handlers.handleBlurChange,
    handleBlurShowBorderChange: state.handlers.handleBlurShowBorderChange,
    handleBlurTypeChange: state.handlers.handleBlurTypeChange,
    handleFocusChange: state.handlers.handleFocusChange,
    handleFocusShowBorderChange: state.handlers.handleFocusShowBorderChange,
    handleSelectPreset: state.handlers.handleSelectPreset,
    localBlurSettings: state.settings.localBlur,
    localFocusSettings: state.settings.localFocus,
    popoverRef: state.surface.popoverRef,
    portalTheme: state.surface.portalTheme,
    selectedPresetId: state.settings.selectedPresetId,
  };
}

export function FrameSettingsPopoverBody(props: FrameSettingsPopoverBodyProps) {
  const state = useFrameSettingsPopoverController(props);

  if (!props.isOpen) {
    return null;
  }

  return <FrameSettingsPopoverSurface {...createFrameSettingsPopoverSurfaceProps(props, state)} />;
}
