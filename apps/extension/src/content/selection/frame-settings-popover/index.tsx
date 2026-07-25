import type React from 'react';
import { createPortal } from 'react-dom';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
} from '../interactive-frame/layout/portal';
import { useFrameSettingsPopoverController } from './controller';
import type { FrameSettingsPopoverProps } from './types';
import { FrameSettingsPopoverContent } from './views';
import { POPOVER_HEIGHT, POPOVER_WIDTH } from './helpers';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';

function stopPopoverPropagation(event: React.MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function FrameSettingsPopover(props: FrameSettingsPopoverProps) {
  const state = useFrameSettingsPopoverController(props);
  const popoverStyle = useFramePopoverPosition({
    anchorEl: props.anchorEl,
    fallbackSize: { width: POPOVER_WIDTH, height: POPOVER_HEIGHT },
    frameId: props.frameId,
    frameRect: props.frameRect,
    isOpen: props.isOpen,
    popoverRef: state.surface.popoverRef,
  });

  if (!props.isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={state.surface.popoverRef}
      className="sniptale-frame-settings-popover sniptale-glass-popover sniptale-content-popover"
      data-theme={state.surface.portalTheme ?? undefined}
      data-frame-id={props.frameId}
      onMouseDown={stopPopoverPropagation}
      onClick={stopPopoverPropagation}
      style={getThemedPortalStyle(state.surface.portalTheme, popoverStyle)}
    >
      <div className="sniptale-content-popover-body">
        <FrameSettingsPopoverContent
          effectMode={props.effectMode}
          globalSettings={state.settings.global}
          handleBlurChange={state.handlers.handleBlurChange}
          handleBlurShowBorderChange={state.handlers.handleBlurShowBorderChange}
          handleBlurTypeChange={state.handlers.handleBlurTypeChange}
          handleFocusChange={state.handlers.handleFocusChange}
          handleFocusShowBorderChange={state.handlers.handleFocusShowBorderChange}
          handleSelectPreset={state.handlers.handleSelectPreset}
          localBlurSettings={state.settings.localBlur}
          localFocusSettings={state.settings.localFocus}
          selectedPresetId={state.settings.selectedPresetId}
        />
      </div>
    </div>,
    resolveContentPortalTarget(props.anchorEl)
  );
}
