import { useAppLocale } from '../../../platform/i18n';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePopoverAdapter } from './adapter';
import { StepBadgePopoverEnabledContent } from './enabled-content';
import { createStepBadgeEnabledContentProps } from './props';
import { useStepBadgePopoverState } from './state';
import { POPOVER_HEIGHT, POPOVER_WIDTH } from './helpers';
import { useFramePopoverPosition } from '../interactive-frame/layout/popover-position';

interface StepBadgePopoverProps {
  anchorEl: HTMLElement | null;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  isOpen: boolean;
  onClose: () => void;
  stepBadge?: StepBadgeSettings;
}

function createEnabledContentProps(
  frameId: string,
  stepBadgeState: ReturnType<typeof useStepBadgePopoverState>
) {
  const {
    handleAnchorChange,
    handleAlphabetChange,
    handleAutoModeChange,
    handleEnabledChange,
    handleOffsetToggle,
    handleSizeLevelChange,
    handleTypeChange,
    handleValueChange,
    isAuto,
    localStepBadgeSettings,
  } = stepBadgeState;

  return createStepBadgeEnabledContentProps({
    frameId,
    handleAlphabetChange,
    handleAnchorChange,
    handleAutoModeChange,
    handleEnabledChange,
    handleOffsetToggle,
    handleSizeLevelChange,
    handleTypeChange,
    handleValueChange,
    isAuto,
    localStepBadgeSettings,
  });
}

export function StepBadgePopover({
  isOpen,
  onClose,
  frameId,
  stepBadge,
  anchorEl,
  frameRect,
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
  const popoverStyle = useFramePopoverPosition({
    anchorEl,
    fallbackSize: { width: POPOVER_WIDTH, height: POPOVER_HEIGHT },
    frameId,
    frameRect,
    isOpen,
    popoverRef,
  });
  const enabledContentProps = createEnabledContentProps(frameId, stepBadgeState);
  return (
    <StepBadgePopoverAdapter
      anchorEl={anchorEl}
      getPopoverStyle={() => popoverStyle}
      isOpen={isOpen}
      popoverRef={popoverRef}
    >
      <StepBadgePopoverEnabledContent {...enabledContentProps} />
    </StepBadgePopoverAdapter>
  );
}
