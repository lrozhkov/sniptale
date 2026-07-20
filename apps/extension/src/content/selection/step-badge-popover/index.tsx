import { useAppLocale } from '../../../platform/i18n';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePopoverAdapter } from './adapter';
import { StepBadgePopoverEnabledContent } from './enabled-content';
import { createStepBadgeEnabledContentProps } from './props';
import { useStepBadgePopoverState } from './state';

interface StepBadgePopoverProps {
  anchorEl: HTMLElement | null;
  frameId: string;
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
}: StepBadgePopoverProps) {
  useAppLocale();
  const stepBadgeState = useStepBadgePopoverState({
    anchorEl,
    frameId,
    isOpen,
    onClose,
    ...(stepBadge === undefined ? {} : { stepBadge }),
  });
  const { getPopoverStyle, popoverRef } = stepBadgeState;
  const enabledContentProps = createEnabledContentProps(frameId, stepBadgeState);
  return (
    <StepBadgePopoverAdapter
      anchorEl={anchorEl}
      getPopoverStyle={getPopoverStyle}
      isOpen={isOpen}
      popoverRef={popoverRef}
    >
      <StepBadgePopoverEnabledContent {...enabledContentProps} />
    </StepBadgePopoverAdapter>
  );
}
