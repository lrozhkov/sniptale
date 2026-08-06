import { useEffect, useRef, useState } from 'react';
import type {
  StepBadgeAlphabet,
  StepBadgeAnchor,
  StepBadgeOffsetDirection,
  StepBadgePreset,
  StepBadgeSettings,
  StepBadgeType,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ContentPopoverAdapter } from '@sniptale/ui/content-popover-adapter';
import { isContentEventWithinElement } from '../../../platform/dom-host';
import { resolveContentPortalTarget } from '../../../selection/interactive-frame/layout/portal';
import { useFramePopoverPosition } from '../../../selection/interactive-frame/layout/popover-position';
import { StepBadgePopoverContent } from '../../../selection/step-badge-popover/body';
import { useStepBadgePresetPopoverController } from '../../../selection/step-badge-popover/preset-controller';
import {
  filterStepBadgeValue,
  toggleStepBadgeOffset,
} from '../../../selection/step-badge-popover/helpers';
import {
  createStepBadgeSettingsFromTemplate,
  createStepBadgeTemplateFromSettings,
} from '../../../../features/highlighter/step-badge-presets/catalog';
import { getLinkedStepBadgeDiameter } from '../../../../features/highlighter/step-badge-presets/style';
import {
  usePopoverDistanceClose,
  usePopoverEscapeClose,
  usePopoverOutsideClose,
} from '../../../selection/popover-sync/hooks';
import {
  SETTINGS_POPOVER_HEIGHT,
  SETTINGS_POPOVER_WIDTH,
} from '../../../selection/popover-sync/settings-surface';
import { StepBadgePresetEditor } from '../../../../ui/highlighter-preset-editor/step-badge';
import { usePopoverInteractionDismissal } from '../../../selection/popover-sync/interaction-dismissal';

const FUTURE_ID = 'future-frame-step-badge';
const EMPTY_RECT = { x: 0, y: 0, width: 0, height: 0 };

export function FutureStepBadgeSettingsPopover(props: {
  anchorEl: HTMLElement | null;
  frameVisuals: {
    borderColor: string;
    borderWidth: number;
    fillColor?: string;
    fillOpacity?: number;
  };
  isOpen: boolean;
  onChange: (settings: StepBadgeSettings) => void;
  onClose: () => void;
  onDisable: () => void;
  settings: StepBadgeSettings;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [local, setLocal] = useState(props.settings);
  const presets = useStepBadgePresetPopoverController(props.isOpen);
  const dismissal = usePopoverInteractionDismissal({
    blocked: presets.editor.isOpen,
    isOpen: props.isOpen,
  });
  const style = useFramePopoverPosition({
    anchorEl: props.anchorEl,
    fallbackSize: { width: SETTINGS_POPOVER_WIDTH, height: SETTINGS_POPOVER_HEIGHT },
    frameId: FUTURE_ID,
    frameRect: EMPTY_RECT,
    isOpen: props.isOpen,
    popoverRef,
  });
  useEffect(() => {
    if (props.isOpen) setLocal(props.settings);
  }, [props.isOpen, props.settings]);
  usePopoverOutsideClose({
    isOpen: dismissal.isDismissalEnabled,
    onClose: props.onClose,
    popoverRef,
    shouldIgnoreOutsideEvent: (event) => isContentEventWithinElement(event, props.anchorEl),
  });
  usePopoverDistanceClose({
    isOpen: dismissal.isDismissalEnabled,
    onClose: props.onClose,
    popoverRef,
  });
  usePopoverEscapeClose({
    anchorEl: props.anchorEl,
    isOpen: dismissal.isDismissalEnabled,
    onClose: props.onClose,
  });
  const commit = (patch: Partial<StepBadgeSettings>) => {
    const next = {
      ...local,
      ...patch,
      sourcePresetId: undefined,
      ...(patch.style ? { style: { ...patch.style } } : {}),
    };
    setLocal(next);
    props.onChange(next);
  };
  const applyPreset = (preset: StepBadgePreset) => {
    const next = createStepBadgeSettingsFromTemplate(preset.settings, preset.id);
    setLocal(next);
    props.onChange(next);
  };
  const template = createStepBadgeTemplateFromSettings(
    local,
    getLinkedStepBadgeDiameter(props.frameVisuals.borderWidth)
  );
  return (
    <ContentPopoverAdapter
      anchorEl={props.anchorEl}
      className={[
        'sniptale-callout-settings-popover sniptale-glass-popover',
        'sniptale-glass-popover--wide sniptale-content-popover--compact',
        'sniptale-content-popover--toolbar-menu sniptale-content-popover--scroll',
        'sniptale-main-toolbar-popover',
      ].join(' ')}
      dataUi="content.toolbar.future-step-badge-popover"
      isOpen={props.isOpen}
      popoverRef={popoverRef}
      portalTarget={resolveContentPortalTarget(props.anchorEl)}
      style={{ ...style, width: SETTINGS_POPOVER_WIDTH }}
    >
      <StepBadgePopoverContent
        frameId={FUTURE_ID}
        frameVisuals={props.frameVisuals}
        headerContext="toolbar"
        isAuto={local.auto !== false}
        localStepBadgeSettings={local}
        onAlphabetChange={(alphabet: StepBadgeAlphabet) => commit({ alphabet })}
        onAnchorChange={(anchor: StepBadgeAnchor) => commit({ anchor, manualPlacement: undefined })}
        onApplyPreset={applyPreset}
        onAutoModeChange={(auto) => commit({ auto })}
        onConfigurePreset={presets.editor.open}
        onCreatePreset={presets.catalog.create}
        onClose={props.onClose}
        onDisable={props.onDisable}
        onFloatingInteractionChange={dismissal.onFloatingInteractionChange}
        onOffsetToggle={(direction: StepBadgeOffsetDirection) =>
          commit({
            manualPlacement: undefined,
            offsetDirections: toggleStepBadgeOffset(local.offsetDirections ?? [], direction),
          })
        }
        onResetPreset={(preset) => void presets.catalog.reset(preset)}
        onShowPresets={presets.catalog.refresh}
        onSettingsChange={commit}
        onTogglePreset={(preset) => void presets.catalog.toggle(preset)}
        onTypeChange={(type: Extract<StepBadgeType, 'number' | 'letter'>) => commit({ type })}
        onUpdatePreset={presets.catalog.update}
        onValueChange={(value) =>
          commit({
            value: filterStepBadgeValue({ auto: local.auto !== false, type: local.type, value }),
          })
        }
        pendingPresetIds={presets.catalog.pending}
        presetError={presets.catalog.error}
        presets={presets.catalog.visiblePresets}
        templateSettings={template}
      />
      {presets.editor.preset ? (
        <StepBadgePresetEditor
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
