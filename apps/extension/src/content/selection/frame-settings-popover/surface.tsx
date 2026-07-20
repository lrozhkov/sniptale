import { createPortal } from 'react-dom';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { FrameSettingsPopoverSurfaceShell } from './surface-shell';
import type { FrameSettingsPopoverSurfaceProps } from './types';

export function FrameSettingsPopoverSurface(props: FrameSettingsPopoverSurfaceProps) {
  return createPortal(
    <FrameSettingsPopoverSurfaceShell
      dataFrameId={props.frameId}
      effectMode={props.effectMode}
      getPopoverStyle={props.getPopoverStyle}
      globalSettings={props.globalSettings}
      handleBlurChange={props.handleBlurChange}
      handleBlurShowBorderChange={props.handleBlurShowBorderChange}
      handleBlurTypeChange={props.handleBlurTypeChange}
      handleFocusChange={props.handleFocusChange}
      handleFocusShowBorderChange={props.handleFocusShowBorderChange}
      handleSelectPreset={props.handleSelectPreset}
      localBlurSettings={props.localBlurSettings}
      localFocusSettings={props.localFocusSettings}
      popoverRef={props.popoverRef}
      portalTheme={props.portalTheme}
      selectedPresetId={props.selectedPresetId}
    />,
    resolveContentPortalTarget(props.anchorEl)
  );
}
