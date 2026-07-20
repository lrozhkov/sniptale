import {
  NumericRow,
  SelectField as CompactSelectField,
  type CompactSelectOption,
  type NumericRowProps,
} from '../../../chrome/ui';
import { CollapsibleSection, HeaderValueToggleSection, PanelSection } from '../sections';
import { clampNumber } from './field-shared';
export { NumberField } from './number-field';

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: CompactSelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <CompactSelectField
      label={props.label}
      value={props.value}
      options={props.options}
      onChange={props.onChange}
    />
  );
}

export function RangeField(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  valueLabel?: string;
}) {
  const unit = resolveNumericUnit(props.valueLabel);
  return (
    <NumericRow
      label={props.label}
      min={props.min ?? 0}
      max={props.max ?? 1}
      step={props.step ?? 0.05}
      unit={unit}
      value={props.value}
      scrub={{ min: props.min ?? 0, max: props.max ?? 1, step: props.step ?? 0.05 }}
      onPreviewValue={props.onChange}
      onCommitValue={props.onChange}
    />
  );
}

function resolveNumericUnit(valueLabel: string | undefined): NumericRowProps['unit'] {
  if (!valueLabel) {
    return '';
  }
  if (valueLabel.endsWith('%')) {
    return '%';
  }
  if (valueLabel.endsWith('px')) {
    return 'px';
  }
  if (valueLabel.endsWith('°')) {
    return 'deg';
  }
  if (valueLabel.endsWith('x')) {
    return 'x';
  }
  return '';
}

export function PercentRangeField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  valueKind?: 'opacity' | 'transparency';
}) {
  const valueKind = props.valueKind ?? 'transparency';
  const percent =
    valueKind === 'opacity'
      ? Math.round((1 - clampNumber(props.value, 0, 1)) * 100)
      : Math.round(clampNumber(props.value, 0, 1) * 100);
  return (
    <RangeField
      label={props.label}
      value={percent}
      min={0}
      max={100}
      step={1}
      valueLabel={`${percent}%`}
      onChange={(nextPercent) => {
        const nextUnit = clampNumber(nextPercent, 0, 100) / 100;
        props.onChange(valueKind === 'opacity' ? 1 - nextUnit : nextUnit);
      }}
    />
  );
}

export { CollapsibleSection, HeaderValueToggleSection, PanelSection };
