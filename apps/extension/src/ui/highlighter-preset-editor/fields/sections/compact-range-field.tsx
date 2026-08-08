import { NumericRow } from '../../../compact-inspector-controls';
import type { CompactInspectorUnit } from '../../../compact-inspector-controls/shared';

export function EditorCompactRangeField({
  displaySuffix,
  label,
  max,
  min,
  onChange,
  value,
}: {
  displaySuffix?: CompactInspectorUnit;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
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
      scrub={{ max, min, step: 1 }}
      step={1}
      unit={displaySuffix}
      value={value}
    />
  );
}
