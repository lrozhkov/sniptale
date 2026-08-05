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

type FrameSettingsPopoverController = ReturnType<typeof useFrameSettingsPopoverController>;

function FrameSettingsPopoverSurface(props: {
  controller: FrameSettingsPopoverController;
  popoverRef: React.Ref<HTMLDivElement>;
  popoverStyle: React.CSSProperties;
  request: FrameSettingsPopoverProps;
}) {
  const { catalog, handlers, settings, surface } = props.controller;

  return (
    <div
      ref={props.popoverRef}
      className={[
        'sniptale-frame-settings-popover',
        'sniptale-glass-popover',
        'sniptale-content-popover',
        'sniptale-content-popover--toolbar-menu',
        props.request.compact ? 'sniptale-content-popover--compact' : '',
      ].join(' ')}
      data-sniptale-activation-bridge="defer"
      data-theme={surface.portalTheme ?? undefined}
      data-frame-id={props.request.frameId}
      onMouseDown={stopPopoverPropagation}
      onClick={stopPopoverPropagation}
      style={getThemedPortalStyle(surface.portalTheme, props.popoverStyle)}
    >
      <div className="sniptale-content-popover-body">
        <FrameSettingsPopoverContent
          compact={props.request.compact ?? false}
          effectMode={props.request.effectMode}
          globalSettings={{ ...settings.global, borderPresets: catalog.visibleBorderPresets }}
          handleBlurChange={handlers.handleBlurChange}
          handleBlurShowBorderChange={handlers.handleBlurShowBorderChange}
          handleBlurTypeChange={handlers.handleBlurTypeChange}
          handleFocusChange={handlers.handleFocusChange}
          handleFocusShowBorderChange={handlers.handleFocusShowBorderChange}
          handleManualBorderChange={handlers.handleManualBorderChange}
          handleAddPreset={handlers.handleAddPreset}
          handleEditPreset={handlers.handleEditPreset}
          handleSelectPreset={handlers.handleSelectPreset}
          handleTogglePresetEnabled={handlers.handleTogglePresetEnabled}
          localBlurSettings={settings.localBlur}
          localBorderSettings={settings.localBorder}
          localFocusSettings={settings.localFocus}
          pendingPresetIds={catalog.pendingPresetIds}
          manual={catalog.manual}
          {...(settings.selectedPresetId === undefined
            ? {}
            : { selectedPresetId: settings.selectedPresetId })}
        />
      </div>
    </div>
  );
}

function FrameStyleEditorLayer(props: { controller: FrameSettingsPopoverController }) {
  const { editor } = props.controller.catalog;
  const { portalTheme } = props.controller.surface;

  return (
    <div
      className="sniptale-frame-style-editor-layer"
      data-sniptale-activation-bridge="defer"
      data-theme={portalTheme ?? undefined}
      onMouseDown={stopPopoverPropagation}
      onClick={stopPopoverPropagation}
    >
      <BorderPresetEditor
        isOpen={editor.isOpen}
        isSaving={editor.isSaving}
        onClose={editor.onClose}
        onSave={editor.onSave}
        {...(editor.preset === undefined ? {} : { preset: editor.preset })}
      />
    </div>
  );
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
      <FrameSettingsPopoverSurface
        controller={state}
        popoverRef={popoverRef}
        popoverStyle={popoverStyle}
        request={props}
      />
      <FrameStyleEditorLayer controller={state} />
    </>,
    resolveContentPortalTarget(props.anchorEl)
  );
}
