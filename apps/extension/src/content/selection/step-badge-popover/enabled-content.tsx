import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { StepBadgePopoverContent } from './body';

export function StepBadgePopoverEnabledContent(props: {
  frameId: string;
  isAuto: boolean;
  localStepBadgeSettings: StepBadgeSettings;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onAnchorChange: (anchor: StepBadgeSettings['anchor']) => void;
  onAutoModeChange: (auto: boolean) => void;
  onDisable: () => void;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onSizeLevelChange: (sizeLevel: StepBadgeSettings['sizeLevel']) => void;
  onTypeChange: (type: 'number' | 'letter') => void;
  onValueChange: (value: string) => void;
}) {
  if (!props.localStepBadgeSettings.enabled) {
    return null;
  }

  return (
    <StepBadgePopoverContent
      frameId={props.frameId}
      isAuto={props.isAuto}
      localStepBadgeSettings={props.localStepBadgeSettings}
      onAlphabetChange={props.onAlphabetChange}
      onAnchorChange={props.onAnchorChange}
      onAutoModeChange={props.onAutoModeChange}
      onDisable={props.onDisable}
      onOffsetToggle={props.onOffsetToggle}
      onSizeLevelChange={props.onSizeLevelChange}
      onTypeChange={props.onTypeChange}
      onValueChange={props.onValueChange}
    />
  );
}
