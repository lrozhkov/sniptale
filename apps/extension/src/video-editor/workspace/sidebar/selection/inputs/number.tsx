import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import type { CompactInspectorUnit } from '../../../../../ui/compact-inspector-controls/shared';
import { useDedupedNumberChange } from '../shared/number-commit';

export function NumberInput({
  value,
  onChange,
  label = 'Value',
  min,
  max,
  step = 1,
  scrub = min !== undefined && max !== undefined,
  unit = '',
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  scrub?: boolean;
  unit?: CompactInspectorUnit;
  disabled?: boolean;
}) {
  const numericValue = Number.isFinite(value) ? value : 0;
  const commitValue = useDedupedNumberChange(onChange);
  const scrubProps =
    scrub && min !== undefined && max !== undefined ? { scrub: { min, max, step } } : {};

  return (
    <NumericRow
      label={label}
      value={numericValue}
      min={min}
      max={max}
      step={step}
      unit={unit}
      disabled={disabled}
      onPreviewValue={commitValue}
      onCommitValue={commitValue}
      {...scrubProps}
    />
  );
}
