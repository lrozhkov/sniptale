import { useAppLocale } from '../../../platform/i18n';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePopoverAdapter } from './adapter';
import { StepBadgePopoverEnabledContent } from './enabled-content';
import { useStepBadgePopoverState } from './state';
import { POPOVER_HEIGHT, POPOVER_WIDTH } from './helpers';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';
import { useStepBadgePresetPopoverController } from './preset-controller';
import { createStepBadgeTemplateFromSettings } from '../../../features/highlighter/step-badge-presets/catalog';
import { getLinkedStepBadgeDiameter } from '../../../features/highlighter/step-badge-presets/style';

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
  const stepBadgeState = useStepBadgePopoverState({
    anchorEl,
    frameId,
    isOpen,
    onClose,
    ...(stepBadge === undefined ? {} : { stepBadge }),
  });
  const { popoverRef } = stepBadgeState;
  const presets = useStepBadgePresetPopoverController(isOpen);
  const popoverStyle = useFramePopoverPosition({
    anchorEl,
    fallbackSize: { width: POPOVER_WIDTH, height: POPOVER_HEIGHT },
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
      getPopoverStyle={() => popoverStyle}
      isOpen={isOpen}
      popoverRef={popoverRef}
    >
      <StepBadgePopoverEnabledContent
        frameId={frameId}
        frameVisuals={visuals}
        isAuto={stepBadgeState.isAuto}
        localStepBadgeSettings={stepBadgeState.localStepBadgeSettings}
        onAlphabetChange={stepBadgeState.handleAlphabetChange}
        onAnchorChange={(anchor) => {
          if (anchor) stepBadgeState.handleAnchorChange(anchor);
        }}
        onApplyPreset={stepBadgeState.applyPreset}
        onAutoModeChange={stepBadgeState.handleAutoModeChange}
        onConfigurePreset={() => undefined}
        onCreatePreset={presets.create}
        onDisable={() => stepBadgeState.handleEnabledChange(false)}
        onOffsetToggle={stepBadgeState.handleOffsetToggle}
        onResetPreset={(preset) => void presets.reset(preset)}
        onSettingsChange={stepBadgeState.handleSettingsChange}
        onTogglePreset={(preset) => void presets.toggle(preset)}
        onTypeChange={(type) => stepBadgeState.handleTypeChange(type)}
        onUpdatePreset={presets.update}
        onValueChange={stepBadgeState.handleValueChange}
        pendingPresetIds={presets.pending}
        presetError={presets.error}
        presets={presets.visiblePresets}
        templateSettings={templateSettings}
      />
    </StepBadgePopoverAdapter>
  );
}
