import { useEffect, useRef, useState } from 'react';
import type {
  CalloutPreset,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { resolveContentPortalTarget } from '../../../selection/interactive-frame/layout/portal';
import { useFramePopoverPosition } from '../../../selection/interactive-frame/layout/popover-position';
import { CalloutSettingsPopoverContent } from '../../../selection/callout-settings-popover/body';
import { useCalloutPresetPopoverController } from '../../../selection/callout-settings-popover/preset-controller';
import {
  applyCalloutSettingsPatch,
  cloneCalloutStyle,
  type CalloutSettingsPatch,
} from '../../../selection/callout/model';
import { CalloutPresetEditor } from '../../../../ui/highlighter-preset-editor/callout';
import { createCalloutSaveSection } from '../../../selection/callout-settings-popover/save-section';
import {
  SETTINGS_POPOVER_HEIGHT,
  SETTINGS_POPOVER_WIDTH,
} from '../../../selection/popover-sync/settings-surface';
import {
  usePopoverDistanceClose,
  usePopoverEscapeClose,
} from '../../../selection/popover-sync/hooks';

const FUTURE_CALLOUT_ID = 'future-frame-callout';
const FUTURE_CALLOUT_RECT = { x: 0, y: 0, width: 0, height: 0 };

export function FutureCalloutSettingsPopover(props: {
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onChange: (settings: CalloutSettings) => void;
  onClose: () => void;
  onDisable: () => void;
  settings: CalloutSettings;
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
  });
  const popoverStyle = useFramePopoverPosition({
    anchorEl: props.anchorEl,
    fallbackSize: { width: SETTINGS_POPOVER_WIDTH, height: SETTINGS_POPOVER_HEIGHT },
    frameId: FUTURE_CALLOUT_ID,
    frameRect: FUTURE_CALLOUT_RECT,
    isOpen: props.isOpen,
    popoverRef,
  });

  useEffect(() => {
    if (props.isOpen) setLocalSettings(props.settings);
  }, [props.isOpen, props.settings]);
  usePopoverDistanceClose({
    isOpen: props.isOpen && !presets.editor.isOpen,
    onClose: props.onClose,
    popoverRef,
  });
  usePopoverEscapeClose({
    anchorEl: props.anchorEl,
    isOpen: props.isOpen && !presets.editor.isOpen,
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
      portalTarget={resolveContentPortalTarget(props.anchorEl)}
      style={{ ...popoverStyle, width: SETTINGS_POPOVER_WIDTH }}
    >
      <CalloutSettingsPopoverContent
        handleDelete={props.onDisable}
        handleSettingChange={handleSettingChange}
        headerContext="toolbar"
        localSettings={localSettings}
        onApplyPreset={applyPreset}
        onClose={props.onClose}
        onCustomizePreset={presets.editor.open}
        onResetPreset={(preset) => void presets.editor.reset(preset)}
        onShowPresets={presets.catalog.refresh}
        onTogglePreset={(preset) => void presets.catalog.toggle(preset)}
        pendingPresetIds={presets.catalog.pendingPresetIds}
        presetError={presets.catalog.error}
        saveSection={saveSection}
        presets={presets.catalog.visiblePresets}
      />
      {presets.editor.preset ? (
        <CalloutPresetEditor
          isOpen={presets.editor.isOpen}
          isSaving={presets.editor.isSaving}
          onClose={presets.editor.close}
          {...(presets.editor.preset.origin === 'system' &&
          presets.editor.preset.customized === true
            ? { onReset: () => presets.editor.reset(presets.editor.preset!) }
            : {})}
          onSave={presets.editor.save}
          preset={presets.editor.preset}
        />
      ) : null}
    </ContentPopoverAdapter>
  );
}
