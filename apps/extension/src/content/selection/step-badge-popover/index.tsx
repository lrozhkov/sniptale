import { useAppLocale } from '../../../platform/i18n';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePopoverAdapter } from './adapter';
import { StepBadgePopoverEnabledContent } from './enabled-content';
import { useStepBadgePopoverState } from './state';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { useStepBadgePresetPopoverController } from './preset-controller';
import { createStepBadgeTemplateFromSettings } from '../../../features/highlighter/step-badge-presets/catalog';
import { getLinkedStepBadgeDiameter } from '../../../features/highlighter/step-badge-presets/style';
import { useFloatingPopoverDrag } from '../popover-sync/drag';
import { SETTINGS_POPOVER_HEIGHT, SETTINGS_POPOVER_WIDTH } from '../popover-sync/settings-surface';
import { StepBadgePresetEditor } from '../../../ui/highlighter-preset-editor/step-badge';
import { usePopoverInteractionDismissal } from '../popover-sync/interaction-dismissal';

interface StepBadgePopoverProps {
  anchorEl: HTMLElement | null;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  isOpen: boolean;
  onClose: () => void;
  stepBadge?: StepBadgeSettings;
  frameVisuals?: {
    borderColor: string;
    borderWidth: number;
    fillColor?: string;
    fillOpacity?: number;
  };
}

function StepBadgePersistentPresetEditor(props: {
  editor: ReturnType<typeof useStepBadgePresetPopoverController>['editor'];
}) {
  const { editor } = props;
  if (!editor.preset) return null;
  return (
    <StepBadgePresetEditor
      isOpen={editor.isOpen}
      isSaving={editor.isSaving}
      onClose={editor.close}
      {...(editor.preset.origin === 'system' && editor.preset.customized === true
        ? { onReset: () => editor.reset(editor.preset!) }
        : {})}
      onSave={editor.save}
      preset={editor.preset}
    />
  );
}

function useStepBadgePopoverPresentation(args: {
  anchorEl: HTMLElement | null;
  frameId: string;
  frameRect: StepBadgePopoverProps['frameRect'];
  isOpen: boolean;
  popoverRef: ReturnType<typeof useStepBadgePopoverState>['popoverRef'];
}) {
  const canonicalStyle = useFramePopoverPosition({
    anchorEl: args.anchorEl,
    fallbackSize: { width: SETTINGS_POPOVER_WIDTH, height: SETTINGS_POPOVER_HEIGHT },
    frameId: args.frameId,
    frameRect: args.frameRect,
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
    quickControlPlacement: 'anchor-aligned',
  });
  const drag = useFloatingPopoverDrag({
    basePosition: {
      left: typeof canonicalStyle.left === 'number' ? canonicalStyle.left : 0,
      top: typeof canonicalStyle.top === 'number' ? canonicalStyle.top : 0,
    },
    isOpen: args.isOpen,
    popoverRef: args.popoverRef,
    resetKey: args.frameId,
  });

  return {
    drag,
    popoverStyle: { ...canonicalStyle, ...drag.position, width: SETTINGS_POPOVER_WIDTH },
  };
}

export function StepBadgePopover({
  isOpen,
  onClose,
  frameId,
  stepBadge,
  anchorEl,
  frameRect,
  frameVisuals,
}: StepBadgePopoverProps) {
  useAppLocale();
  const presets = useStepBadgePresetPopoverController(isOpen);
  const dismissal = usePopoverInteractionDismissal({ blocked: presets.editor.isOpen, isOpen });
  const stepBadgeState = useStepBadgePopoverState({
    anchorEl,
    frameId,
    isDismissalEnabled: dismissal.isDismissalEnabled,
    isOpen,
    onClose,
    ...(stepBadge === undefined ? {} : { stepBadge }),
  });
  const { popoverRef } = stepBadgeState;
  const presentation = useStepBadgePopoverPresentation({
    anchorEl,
    frameId,
    frameRect,
    isOpen,
    popoverRef,
  });
  const visuals = frameVisuals ?? { borderColor: '#f97316', borderWidth: 4 };
  const templateSettings = createStepBadgeTemplateFromSettings(
    stepBadgeState.localStepBadgeSettings,
    getLinkedStepBadgeDiameter(visuals.borderWidth)
  );
  return (
    <StepBadgePopoverAdapter
      anchorEl={anchorEl}
      getPopoverStyle={() => presentation.popoverStyle}
      isOpen={isOpen}
      popoverRef={popoverRef}
    >
      <StepBadgePopoverEnabledContent
        frameId={frameId}
        frameVisuals={visuals}
        headerContext="element"
        headerDrag={presentation.drag}
        isAuto={stepBadgeState.isAuto}
        localStepBadgeSettings={stepBadgeState.localStepBadgeSettings}
        onAlphabetChange={stepBadgeState.handleAlphabetChange}
        onAnchorChange={(anchor) => {
          if (anchor) stepBadgeState.handleAnchorChange(anchor);
        }}
        onApplyPreset={stepBadgeState.applyPreset}
        onAutoModeChange={stepBadgeState.handleAutoModeChange}
        onConfigurePreset={presets.editor.open}
        onCreatePreset={presets.catalog.create}
        onClose={onClose}
        onDisable={() => stepBadgeState.handleEnabledChange(false)}
        onFloatingInteractionChange={dismissal.onFloatingInteractionChange}
        onOffsetToggle={stepBadgeState.handleOffsetToggle}
        onResetPreset={(preset) => void presets.catalog.reset(preset)}
        onSettingsChange={stepBadgeState.handleSettingsChange}
        onTogglePreset={(preset) => void presets.catalog.toggle(preset)}
        onTypeChange={(type) => stepBadgeState.handleTypeChange(type)}
        onUpdatePreset={presets.catalog.update}
        onValueChange={stepBadgeState.handleValueChange}
        pendingPresetIds={presets.catalog.pending}
        presetError={presets.catalog.error}
        presets={presets.catalog.visiblePresets}
        templateSettings={templateSettings}
      />
      <StepBadgePersistentPresetEditor editor={presets.editor} />
    </StepBadgePopoverAdapter>
  );
}
