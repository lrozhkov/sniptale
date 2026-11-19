import { NumericRow } from '../../../compact-inspector-controls';
import type { CompactInspectorUnit } from '../../../compact-inspector-controls/shared';

export function EditorCompactRangeField({
  displaySuffix,
  label,
  max,
  min,
  onChange,
  scale,
  value,
}: {
  displaySuffix?: CompactInspectorUnit;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  scale?: boolean;
  value: number;
}) {
  return (
    <NumericRow
      appearance="plain"
      label={label}
      max={max}
      min={min}
      onCommitValue={onChange}
      onPreviewValue={onChange}
      {...(scale ? { rangePresentation: 'field', scrub: { min, max, step: 1 } } : {})}
      step={1}
      unit={displaySuffix}
      value={value}
    />
  );
}
