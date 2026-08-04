import { useEffect, useRef, useState } from 'react';
import type { PointerEventHandler } from 'react';
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

const FUTURE_CALLOUT_ID = 'future-frame-callout';
const FUTURE_CALLOUT_RECT = { x: 0, y: 0, width: 0, height: 0 };
const STATIC_POINTER_HANDLER: PointerEventHandler<HTMLDivElement> = () => undefined;

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
    fallbackSize: { width: 384, height: 620 },
    frameId: FUTURE_CALLOUT_ID,
    frameRect: FUTURE_CALLOUT_RECT,
    isOpen: props.isOpen,
    popoverRef,
  });

  useEffect(() => {
    if (props.isOpen) setLocalSettings(props.settings);
  }, [props.isOpen, props.settings]);

  const commit = (next: CalloutSettings) => {
    setLocalSettings(next);
    props.onChange(next);
  };
  const handleSettingChange = (patch: CalloutSettingsPatch) => {
    commit(applyCalloutSettingsPatch(localSettings, patch));
  };
  const applyPreset = (preset: CalloutPreset) => {
    commit(
      applyCalloutSettingsPatch(localSettings, {
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
      ].join(' ')}
      dataUi="content.toolbar.future-callout-popover"
      isOpen={props.isOpen}
      popoverRef={popoverRef}
      portalTarget={resolveContentPortalTarget(props.anchorEl)}
      style={{ ...popoverStyle, width: 384 }}
    >
      <CalloutSettingsPopoverContent
        handleDelete={props.onDisable}
        handleSettingChange={handleSettingChange}
        headerDrag={{
          isDragging: false,
          onPointerDown: STATIC_POINTER_HANDLER,
          onPointerMove: STATIC_POINTER_HANDLER,
          onPointerUp: STATIC_POINTER_HANDLER,
        }}
        localSettings={localSettings}
        onApplyPreset={applyPreset}
        onClose={props.onClose}
        onCustomizePreset={presets.editor.open}
        onResetPreset={(preset) => void presets.editor.reset(preset)}
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
