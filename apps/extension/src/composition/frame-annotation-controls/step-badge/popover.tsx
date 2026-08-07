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
import { StepBadgePopoverContent } from './body';
import { useStepBadgePresetPopoverController } from './preset-controller';
import { filterStepBadgeValue, toggleStepBadgeOffset } from './helpers';
import {
  createStepBadgeSettingsFromTemplate,
  createStepBadgeTemplateFromSettings,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { getLinkedStepBadgeDiameter } from '../../../features/highlighter/step-badge-presets/style';
import {
  usePopoverDistanceClose,
  usePopoverEscapeClose,
  usePopoverOutsideClose,
} from '../popover/hooks';
import { SETTINGS_POPOVER_HEIGHT, SETTINGS_POPOVER_WIDTH } from '../popover/surface';
import { usePopoverInteractionDismissal } from '../popover/interaction-dismissal';
import type { SettingsPopoverContext } from '../popover/header';
import { useFrameAnnotationPopoverPresentation } from '../popover/presentation';
import type { TemplateSourceControl } from '../popover/template-source';

const FUTURE_ID = 'future-frame-step-badge';
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
  onReorder?: (direction: 'up' | 'down', frameId: string) => void;
  settings: StepBadgeSettings;
  portalTarget?: Element | DocumentFragment;
  headerContext?: SettingsPopoverContext;
  resetKey?: string;
  templateSourceControl?: TemplateSourceControl;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [local, setLocal] = useState(props.settings);
  const presets = useStepBadgePresetPopoverController(props.isOpen);
  const dismissal = usePopoverInteractionDismissal({
    blocked: presets.editor.isOpen,
    isOpen: props.isOpen,
  });
  const headerContext = props.headerContext ?? 'toolbar';
  const portalTarget = resolvePopoverPortalTarget(props.portalTarget);
  const presentation = useFrameAnnotationPopoverPresentation({
    anchorEl: props.anchorEl,
    context: headerContext,
    height: SETTINGS_POPOVER_HEIGHT,
    isOpen: props.isOpen,
    popoverRef,
    resetKey: props.resetKey ?? FUTURE_ID,
    width: SETTINGS_POPOVER_WIDTH,
  });
  useEffect(() => {
    if (props.isOpen) setLocal(props.settings);
  }, [props.isOpen, props.settings]);
  usePopoverOutsideClose({
    isOpen: dismissal.isDismissalEnabled,
    onClose: props.onClose,
    popoverRef,
    shouldIgnoreOutsideEvent: (event) => isEventWithinElement(event, props.anchorEl),
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
  const markTemplateCreated = (sourcePresetId: string) => {
    const next = { ...local, sourcePresetId };
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
      portalTarget={portalTarget}
      style={{ ...presentation.style, width: SETTINGS_POPOVER_WIDTH }}
    >
      <StepBadgePopoverContent
        frameId={FUTURE_ID}
        frameVisuals={props.frameVisuals}
        headerContext={headerContext}
        {...(presentation.drag ? { headerDrag: presentation.drag } : {})}
        isAuto={local.auto !== false}
        localStepBadgeSettings={local}
        onAlphabetChange={(alphabet: StepBadgeAlphabet) => commit({ alphabet })}
        onAnchorChange={(anchor: StepBadgeAnchor) => commit({ anchor, manualPlacement: undefined })}
        onApplyPreset={applyPreset}
        onForkPreset={() => commit({})}
        onAutoModeChange={(auto) => commit({ auto })}
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
        {...(props.onReorder ? { onReorder: props.onReorder } : {})}
        onShowPresets={presets.catalog.refresh}
        onSettingsChange={commit}
        onTogglePreset={(preset) => void presets.catalog.toggle(preset)}
        onTemplateCreated={markTemplateCreated}
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
        {...(props.templateSourceControl
          ? { templateSourceControl: props.templateSourceControl }
          : {})}
      />
    </ContentPopoverAdapter>
  );
}

function isEventWithinElement(event: Event, element: Element | null): boolean {
  if (!element) return false;
  return (
    event.composedPath().includes(element) ||
    (event.target instanceof Node && element.contains(event.target))
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
