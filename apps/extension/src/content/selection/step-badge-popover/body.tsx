import { ProductGlassDestructiveButton } from '@sniptale/ui/product-glass-controls';
import { translate } from '../../../platform/i18n';
import type {
  StepBadgeAnchor,
  StepBadgeSettings,
  StepBadgeSizeLevel,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  StepBadgeAutoSection,
  StepBadgePositionSection,
  StepBadgeSizeSection,
  StepBadgeValueSection,
} from './views';

function StepBadgeDisableButton(props: { onDisable: () => void }) {
  return (
    <ProductGlassDestructiveButton onClick={props.onDisable}>
      {translate('content.stepBadge.disableButton')}
    </ProductGlassDestructiveButton>
  );
}

export function StepBadgePopoverContent(props: {
  frameId: string;
  isAuto: boolean;
  localStepBadgeSettings: StepBadgeSettings;
  onAlphabetChange: (alphabet: 'cyrillic' | 'latin') => void;
  onAnchorChange: (anchor: StepBadgeAnchor) => void;
  onAutoModeChange: (auto: boolean) => void;
  onDisable: () => void;
  onOffsetToggle: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onSizeLevelChange: (sizeLevel: StepBadgeSizeLevel) => void;
  onTypeChange: (type: 'number' | 'letter') => void;
  onValueChange: (value: string) => void;
}) {
  const selectedAnchor = props.localStepBadgeSettings.anchor ?? 'top-left';
  const selectedOffsets = props.localStepBadgeSettings.offsetDirections ?? [];

  return (
    <>
      <StepBadgePositionSection
        onAnchorChange={props.onAnchorChange}
        onOffsetToggle={props.onOffsetToggle}
        selectedAnchor={selectedAnchor}
        selectedOffsets={selectedOffsets}
      />

      <StepBadgeSizeSection
        onSizeLevelChange={props.onSizeLevelChange}
        sizeLevel={props.localStepBadgeSettings.sizeLevel}
      />

      <StepBadgeAutoSection
        isAuto={props.isAuto}
        settings={props.localStepBadgeSettings}
        onAlphabetChange={props.onAlphabetChange}
        onAutoModeChange={props.onAutoModeChange}
        onTypeChange={props.onTypeChange}
      />

      <StepBadgeValueSection
        frameId={props.frameId}
        isAuto={props.isAuto}
        onValueChange={props.onValueChange}
        value={props.localStepBadgeSettings.value}
      />

      <StepBadgeDisableButton onDisable={props.onDisable} />
    </>
  );
}
