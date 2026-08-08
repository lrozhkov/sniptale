import type React from 'react';
import { createPortal } from 'react-dom';
import {
  getThemedPortalStyle,
  resolveContentPortalTarget,
} from '../interactive-frame/layout/portal';
import { useFrameSettingsPopoverController } from './controller';
import type { FrameSettingsPopoverProps } from './types';
import { FrameSettingsPopoverContent } from '../../../composition/frame-annotation-controls/frame/views';
import { dispatchFutureFrameDefaultsChanged } from '../../platform/page-context/frame-events';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { useFloatingSurfaceWheelContainment } from '@sniptale/ui/floating-interactions/wheel';
import {
  useFloatingPopoverDrag,
  type FloatingPopoverDrag,
} from '../../../composition/frame-annotation-controls/popover/drag';
import {
  SETTINGS_POPOVER_HEIGHT,
  SETTINGS_POPOVER_WIDTH,
} from '../../../composition/frame-annotation-controls/popover/surface';
import { createTrustedContentActionIntentSource } from '../../application/privileged-action-intent';
import { useLinkedAnnotationTemplateOptions } from '../../../composition/frame-annotation-controls/frame/linked-template-options';

function stopPopoverPropagation(event: React.MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

type FrameSettingsPopoverController = ReturnType<typeof useFrameSettingsPopoverController>;

function FrameSettingsPopoverSurface(props: {
  controller: FrameSettingsPopoverController;
  drag: FloatingPopoverDrag;
  popoverRef: React.Ref<HTMLDivElement>;
  request: FrameSettingsPopoverProps;
  linkedTemplateOptions: ReturnType<typeof useLinkedAnnotationTemplateOptions>;
}) {
  const { catalog, handlers, settings, surface } = props.controller;

  return (
    <div
      ref={props.popoverRef}
      className={[
        'sniptale-frame-settings-popover',
        'sniptale-glass-popover',
        'sniptale-content-popover',
        'sniptale-content-ui-zoom-surface',
        'sniptale-content-popover--toolbar-menu',
        props.request.scope === 'session' ? 'sniptale-main-toolbar-popover' : '',
        props.request.compact ? 'sniptale-content-popover--compact' : '',
      ].join(' ')}
      data-sniptale-activation-bridge="defer"
      data-theme={surface.portalTheme ?? undefined}
      data-frame-id={props.request.frameId}
      onMouseDown={stopPopoverPropagation}
      onClick={stopPopoverPropagation}
      style={getThemedPortalStyle(surface.portalTheme, { width: SETTINGS_POPOVER_WIDTH })}
    >
      <div className="sniptale-content-popover-body">
        <FrameSettingsPopoverContent
          acceptAction={(event) => Boolean(createTrustedContentActionIntentSource(event))}
          compact={props.request.compact ?? false}
          effectMode={props.request.effectMode}
          globalSettings={{ ...settings.global, borderPresets: catalog.visibleBorderPresets }}
          handleBlurChange={handlers.handleBlurChange}
          handleBlurShowBorderChange={handlers.handleBlurShowBorderChange}
          handleBlurTypeChange={handlers.handleBlurTypeChange}
          handleFocusBlurChange={handlers.handleFocusBlurChange}
          handleFocusChange={handlers.handleFocusChange}
          handleFocusShowBorderChange={handlers.handleFocusShowBorderChange}
          handleForkPreset={handlers.handleForkPreset}
          onApplyToFuture={() =>
            dispatchFutureFrameDefaultsChanged({
              kind: 'frame',
              settings: {
                blurSettings: settings.localBlur,
                borderSettings: settings.localBorder,
                effectMode: props.request.effectMode,
                focusSettings: settings.localFocus,
              },
            })
          }
          handleManualBorderChange={handlers.handleManualBorderChange}
          handleSelectPreset={handlers.handleSelectPreset}
          handleTogglePresetEnabled={handlers.handleTogglePresetEnabled}
          localBlurSettings={settings.localBlur}
          localBorderSettings={settings.localBorder}
          localFocusSettings={settings.localFocus}
          linkedTemplateOptions={props.linkedTemplateOptions}
          pendingPresetIds={catalog.pendingPresetIds}
          onShowPresets={catalog.refreshPresets}
          manual={catalog.manual}
          onFloatingInteractionChange={surface.onFloatingInteractionChange}
          headerContext={props.request.scope === 'session' ? 'toolbar' : 'element'}
          {...(props.request.scope === 'session' ? {} : { headerDrag: props.drag })}
          onClose={props.request.onClose}
          onEffectModeChange={props.request.onEffectModeChange ?? (() => undefined)}
          {...(settings.selectedPresetId === undefined
            ? {}
            : { selectedPresetId: settings.selectedPresetId })}
        />
      </div>
    </div>
  );
}

export function FrameSettingsPopover(props: FrameSettingsPopoverProps) {
  const state = useFrameSettingsPopoverController(props);
  const linkedTemplateOptions = useLinkedAnnotationTemplateOptions();
  const popoverRef = useFloatingSurfaceWheelContainment(state.surface.popoverRef);
  const canonicalStyle = useFramePopoverPosition({
    anchorEl: props.anchorEl,
    fallbackSize: { width: SETTINGS_POPOVER_WIDTH, height: SETTINGS_POPOVER_HEIGHT },
    frameId: props.frameId,
    frameRect: props.frameRect,
    isOpen: props.isOpen,
    popoverRef: state.surface.popoverRef,
    quickControlPlacement: 'frame-aware',
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
  };

  if (!props.isOpen) {
    return null;
  }

  return createPortal(
    <div className="sniptale-content-popover-positioner" style={popoverStyle}>
      <FrameSettingsPopoverSurface
        controller={state}
        drag={drag}
        popoverRef={popoverRef}
        request={props}
        linkedTemplateOptions={linkedTemplateOptions}
      />
    </div>,
    resolveContentPortalTarget(props.anchorEl)
  );
}
