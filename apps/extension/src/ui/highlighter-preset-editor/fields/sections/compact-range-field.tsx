import { NumericRow } from '../../../compact-inspector-controls';
import type { CompactInspectorUnit } from '../../../compact-inspector-controls/shared';

export function EditorCompactRangeField({
  displaySuffix,
  label,
  max,
  min,
  onChange,
  scrubbable = true,
  value,
}: {
  displaySuffix?: CompactInspectorUnit;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  scrubbable?: boolean;
  value: number;
}) {
  return (
    <NumericRow
      appearance="plain"
      keyboardStep={!scrubbable}
      label={label}
      max={max}
      min={min}
      onCommitValue={onChange}
      onPreviewValue={onChange}
      scrub={scrubbable ? { max, min, step: 1 } : undefined}
      step={1}
      unit={displaySuffix}
      value={value}
    />
  );
}
