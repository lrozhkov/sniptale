import { useEffect, useRef, useState } from 'react';

import type {
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { CalloutSettingsPopoverContent } from './body';
import { useCalloutPresetPopoverController } from './preset-controller';
import {
  applyCalloutSettingsPatch,
  cloneCalloutStyle,
  type CalloutSettingsPatch,
} from '../../../features/highlighter/frame-annotation/callout/model';
import { createCalloutSaveSection } from './save-section';
import { SETTINGS_POPOVER_HEIGHT, SETTINGS_POPOVER_WIDTH } from '../popover/surface';
import { usePopoverDistanceClose, usePopoverEscapeClose } from '../popover/hooks';
import type { SettingsPopoverContext } from '../popover/header';
import { useFrameAnnotationPopoverPresentation } from '../popover/presentation';
import type { TemplateSourceControl } from '../popover/template-source';

export function FutureCalloutSettingsPopover(props: {
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onChange: (settings: CalloutSettings) => void;
  onClose: () => void;
  onDisable: () => void;
  settings: CalloutSettings;
  portalTarget?: Element | DocumentFragment;
  headerContext?: SettingsPopoverContext;
  resetKey?: string;
  templateSourceControl?: TemplateSourceControl;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [localSettings, setLocalSettings] = useState(props.settings);
  const presets = useCalloutPresetPopoverController(props.isOpen);
  const saveSection = createCalloutSaveSection({
    create: presets.catalog.create,
    error: presets.catalog.error,
    isSaving: presets.catalog.isSaving,
    overwrite: presets.catalog.overwrite,
    presets: presets.catalog.presets,
    settings: localSettings,
    onCreated: (sourcePresetId) => {
      const next = { ...localSettings, sourcePresetId };
      setLocalSettings(next);
      props.onChange(next);
    },
  });
  const headerContext = props.headerContext ?? 'toolbar';
  const portalTarget = resolvePopoverPortalTarget(props.portalTarget);
  const presentation = useFrameAnnotationPopoverPresentation({
    anchorEl: props.anchorEl,
    context: headerContext,
    height: SETTINGS_POPOVER_HEIGHT,
    isOpen: props.isOpen,
    popoverRef,
    resetKey: props.resetKey ?? 'future-callout',
    width: SETTINGS_POPOVER_WIDTH,
  });

  useEffect(() => {
    if (props.isOpen) setLocalSettings(props.settings);
  }, [props.isOpen, props.settings]);
  usePopoverDistanceClose({
    isOpen: props.isOpen,
    onClose: props.onClose,
    popoverRef,
  });
  usePopoverEscapeClose({
    anchorEl: props.anchorEl,
    isOpen: props.isOpen,
    onClose: props.onClose,
  });

  const commit = (next: CalloutSettings) => {
    setLocalSettings(next);
    props.onChange(next);
  };
  const handleSettingChange = (patch: CalloutSettingsPatch) => {
    commit(
      applyCalloutSettingsPatch(
        localSettings,
        patch.style && !('sourcePresetId' in patch)
          ? { ...patch, sourcePresetId: undefined }
          : patch
      )
    );
  };
  const applyPreset = (preset: CalloutPreset) => {
    commit(
      applyCalloutSettingsPatch(localSettings, {
        content: { titleText: preset.content.titleText },
        placement: {
          ...preset.placement,
          connectorBasePosition: undefined,
          connectorBaseWidth: undefined,
          connectorFramePosition: undefined,
          connectorWaypoint: undefined,
          manualPlacement: undefined,
        },
        sourcePresetId: preset.id,
        style: cloneCalloutStyle(preset.style),
      })
    );
  };

  return (
    <ContentPopoverAdapter
      anchorEl={props.anchorEl}
      className={[
        'sniptale-callout-settings-popover sniptale-glass-popover',
        'sniptale-glass-popover--wide sniptale-content-popover--compact',
        'sniptale-content-popover--toolbar-menu sniptale-content-popover--scroll',
        'sniptale-main-toolbar-popover',
      ].join(' ')}
      dataUi="content.toolbar.future-callout-popover"
      isOpen={props.isOpen}
      popoverRef={popoverRef}
      portalTarget={portalTarget}
      style={{ ...presentation.style, width: SETTINGS_POPOVER_WIDTH }}
    >
      <CalloutSettingsPopoverContent
        handleDelete={props.onDisable}
        handleSettingChange={handleSettingChange}
        headerContext={headerContext}
        {...(presentation.drag ? { headerDrag: presentation.drag } : {})}
        localSettings={localSettings}
        onApplyPreset={applyPreset}
        onForkPreset={() => handleSettingChange({ sourcePresetId: undefined })}
        onClose={props.onClose}
        onResetPreset={(preset) => void presets.editor.reset(preset)}
        onShowPresets={presets.catalog.refresh}
        onTogglePreset={(preset) => void presets.catalog.toggle(preset)}
        pendingPresetIds={presets.catalog.pendingPresetIds}
        presetError={presets.catalog.error}
        saveSection={saveSection}
        presets={presets.catalog.visiblePresets}
        {...(props.templateSourceControl
          ? { templateSourceControl: props.templateSourceControl }
          : {})}
      />
    </ContentPopoverAdapter>
  );
}

function resolvePopoverPortalTarget(
  target: Element | DocumentFragment | undefined
): HTMLElement | ShadowRoot | DocumentFragment {
  return target instanceof HTMLElement ||
    target instanceof ShadowRoot ||
    target instanceof DocumentFragment
    ? target
    : document.body;
}
