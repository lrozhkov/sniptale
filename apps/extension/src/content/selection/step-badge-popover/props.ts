import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';

export function createStepBadgeEnabledContentProps(args: {
  frameId: string;
  handleAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  handleAnchorChange: (anchor: NonNullable<StepBadgeSettings['anchor']>) => void;
  handleAutoModeChange: (auto: boolean) => void;
  handleEnabledChange: (enabled: boolean) => void;
  handleOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  handleSizeLevelChange: (sizeLevel: NonNullable<StepBadgeSettings['sizeLevel']>) => void;
  handleTypeChange: (type: 'number' | 'letter') => void;
  handleValueChange: (value: string) => void;
  isAuto: boolean;
  localStepBadgeSettings: StepBadgeSettings;
}) {
  return {
    frameId: args.frameId,
    isAuto: args.isAuto,
    localStepBadgeSettings: args.localStepBadgeSettings,
    onAlphabetChange: args.handleAlphabetChange,
    onAnchorChange: (anchor: StepBadgeSettings['anchor']) => {
      if (anchor) {
        args.handleAnchorChange(anchor);
      }
    },
    onAutoModeChange: args.handleAutoModeChange,
    onDisable: () => args.handleEnabledChange(false),
    onOffsetToggle: args.handleOffsetToggle,
    onSizeLevelChange: (sizeLevel: StepBadgeSettings['sizeLevel']) => {
      if (sizeLevel !== undefined) {
        args.handleSizeLevelChange(sizeLevel);
      }
    },
    onTypeChange: args.handleTypeChange,
    onValueChange: args.handleValueChange,
  };
}
