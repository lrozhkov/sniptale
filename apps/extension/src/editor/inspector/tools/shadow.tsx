import { translate } from '../../../platform/i18n';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { NumericRow } from '../../chrome/ui';

interface ShadowRangeSectionProps {
  value: BorderPreset['shadow'];
  onChange: (value: BorderPreset['shadow']) => void;
  onValueCommit?: () => void;
  label?: string;
}

interface ShadowNumericRangeSectionProps {
  label?: string;
  max?: number;
  value: number;
  onChange: (value: number) => void;
  onValueCommit?: () => void;
  unit?: 'degree' | 'px';
}

export function ShadowRangeSection(props: ShadowRangeSectionProps) {
  const label = props.label ?? translate('highlighter.editor.shadowLabel');

  return (
    <NumericRow
      label={label}
      min={0}
      max={100}
      step={1}
      unit="%"
      value={props.value}
      scrub={{ min: 0, max: 100, step: 1 }}
      onPreviewValue={props.onChange}
      onCommitValue={(value) => {
        props.onChange(value);
        props.onValueCommit?.();
      }}
    />
  );
}

function ShadowNumericRangeSection(props: ShadowNumericRangeSectionProps) {
  const unit = props.unit ?? 'px';
  const label = props.label ?? translate('highlighter.editor.shadowLabel');

  return (
    <NumericRow
      label={label}
      min={0}
      max={props.max ?? 64}
      step={1}
      unit={unit === 'degree' ? 'deg' : 'px'}
      value={props.value}
      scrub={{ min: 0, max: props.max ?? 64, step: 1 }}
      onPreviewValue={props.onChange}
      onCommitValue={(value) => {
        props.onChange(value);
        props.onValueCommit?.();
      }}
    />
  );
}

export function ShadowAngleSection(props: Omit<ShadowNumericRangeSectionProps, 'max' | 'unit'>) {
  return (
    <ShadowNumericRangeSection
      {...props}
      label={props.label ?? translate('editor.compact.shadowAngle')}
      max={360}
      unit="degree"
    />
  );
}

export function ShadowDistanceSection(props: Omit<ShadowNumericRangeSectionProps, 'unit'>) {
  return (
    <ShadowNumericRangeSection
      {...props}
      label={props.label ?? translate('editor.compact.shadowDistance')}
      unit="px"
    />
  );
}

export function ShadowBlurSection(props: Omit<ShadowNumericRangeSectionProps, 'unit'>) {
  return (
    <ShadowNumericRangeSection
      {...props}
      label={props.label ?? translate('editor.compact.shadowBlur')}
      unit="px"
    />
  );
}
