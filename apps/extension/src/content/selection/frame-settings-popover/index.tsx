import type React from 'react';
import { createPortal } from 'react-dom';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
} from '../interactive-frame/layout/portal';
import { useFrameSettingsPopoverController } from './controller';
import type { FrameSettingsPopoverProps } from './types';
import { FrameSettingsPopoverContent } from './views';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { BorderPresetEditor } from '../../../ui/highlighter-preset-editor';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
import { useFloatingPopoverDrag, type FloatingPopoverDrag } from '../popover-sync/drag';
import { SETTINGS_POPOVER_HEIGHT, SETTINGS_POPOVER_WIDTH } from '../popover-sync/settings-surface';

function stopPopoverPropagation(event: React.MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

type FrameSettingsPopoverController = ReturnType<typeof useFrameSettingsPopoverController>;

function FrameSettingsPopoverSurface(props: {
  controller: FrameSettingsPopoverController;
  drag: FloatingPopoverDrag;
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
        props.request.scope === 'session' ? 'sniptale-main-toolbar-popover' : '',
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
          onFloatingInteractionChange={surface.onFloatingInteractionChange}
          headerContext={props.request.scope === 'session' ? 'toolbar' : 'element'}
          {...(props.request.scope === 'session' ? {} : { headerDrag: props.drag })}
          onClose={props.request.onClose}
          {...(settings.selectedPresetId === undefined
            ? {}
            : { selectedPresetId: settings.selectedPresetId })}
        />
      </div>
    </div>
  );
}

function FrameStyleEditorLayer(props: {
  controller: FrameSettingsPopoverController;
  toolbarOrigin: boolean;
}) {
  const { editor } = props.controller.catalog;
  const { portalTheme } = props.controller.surface;

  return (
    <div
      className={[
        'sniptale-frame-style-editor-layer',
        props.toolbarOrigin ? 'sniptale-main-toolbar-popover' : '',
      ].join(' ')}
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
  const canonicalStyle = useFramePopoverPosition({
    anchorEl: props.anchorEl,
    fallbackSize: { width: SETTINGS_POPOVER_WIDTH, height: SETTINGS_POPOVER_HEIGHT },
    frameId: props.frameId,
    frameRect: props.frameRect,
    isOpen: props.isOpen,
    popoverRef: state.surface.popoverRef,
  });
  const drag = useFloatingPopoverDrag({
    basePosition: {
      left: typeof canonicalStyle.left === 'number' ? canonicalStyle.left : 0,
      top: typeof canonicalStyle.top === 'number' ? canonicalStyle.top : 0,
    },
    isOpen: props.isOpen,
    popoverRef: state.surface.popoverRef,
    resetKey: props.frameId,
  });
  const popoverStyle = {
    ...canonicalStyle,
    ...(props.scope === 'session' ? {} : drag.position),
    width: SETTINGS_POPOVER_WIDTH,
  };

  if (!props.isOpen) {
    return null;
  }

  return createPortal(
    <>
      <FrameSettingsPopoverSurface
        controller={state}
        drag={drag}
        popoverRef={popoverRef}
        popoverStyle={popoverStyle}
        request={props}
      />
      <FrameStyleEditorLayer controller={state} toolbarOrigin={props.scope === 'session'} />
    </>,
    resolveContentPortalTarget(props.anchorEl)
  );
}
