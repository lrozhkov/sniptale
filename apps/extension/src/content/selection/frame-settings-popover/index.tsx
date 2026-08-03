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
import { BorderPresetEditor } from '../../../ui/highlighter-preset-editor';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';

function stopPopoverPropagation(event: React.MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function FrameSettingsPopover(props: FrameSettingsPopoverProps) {
  const state = useFrameSettingsPopoverController(props);
  const popoverRef = useFloatingSurfaceWheelContainment(state.surface.popoverRef);
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
    <>
      <div
        ref={popoverRef}
        className={[
          'sniptale-frame-settings-popover',
          'sniptale-glass-popover',
          'sniptale-content-popover',
          'sniptale-content-popover--toolbar-menu',
        ].join(' ')}
        data-sniptale-activation-bridge="defer"
        data-theme={state.surface.portalTheme ?? undefined}
        data-frame-id={props.frameId}
        onMouseDown={stopPopoverPropagation}
        onClick={stopPopoverPropagation}
        style={getThemedPortalStyle(state.surface.portalTheme, popoverStyle)}
      >
        <div className="sniptale-content-popover-body">
          <FrameSettingsPopoverContent
            effectMode={props.effectMode}
            globalSettings={{
              ...state.settings.global,
              borderPresets: state.catalog.visibleBorderPresets,
            }}
            handleBlurChange={state.handlers.handleBlurChange}
            handleBlurShowBorderChange={state.handlers.handleBlurShowBorderChange}
            handleBlurTypeChange={state.handlers.handleBlurTypeChange}
            handleFocusChange={state.handlers.handleFocusChange}
            handleFocusShowBorderChange={state.handlers.handleFocusShowBorderChange}
            handleAddPreset={state.handlers.handleAddPreset}
            handleEditPreset={state.handlers.handleEditPreset}
            handleSelectPreset={state.handlers.handleSelectPreset}
            handleTogglePresetEnabled={state.handlers.handleTogglePresetEnabled}
            localBlurSettings={state.settings.localBlur}
            localFocusSettings={state.settings.localFocus}
            pendingPresetIds={state.catalog.pendingPresetIds}
            selectedPresetId={state.settings.selectedPresetId}
          />
        </div>
      </div>
      <div
        className="sniptale-frame-style-editor-layer"
        data-sniptale-activation-bridge="defer"
        data-theme={state.surface.portalTheme ?? undefined}
        onMouseDown={stopPopoverPropagation}
        onClick={stopPopoverPropagation}
      >
        <BorderPresetEditor
          isOpen={state.catalog.editor.isOpen}
          isSaving={state.catalog.editor.isSaving}
          onClose={state.catalog.editor.onClose}
          onSave={state.catalog.editor.onSave}
          {...(state.catalog.editor.preset === undefined
            ? {}
            : { preset: state.catalog.editor.preset })}
        />
      </div>
    </>,
    resolveContentPortalTarget(props.anchorEl)
  );
}
