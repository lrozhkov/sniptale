import { useEffect, useRef } from 'react';
import { NumericRow } from '../../ui/compact-inspector-controls';
import type { CompactInspectorUnit } from '../../ui/compact-inspector-controls/shared';

/**
 * Preview and commit share one deduped sink: a repeated proposal never stages the
 * same mutation twice, and an externally restored value becomes editable again.
 */
function useDedupedNumber(applied: number, onChange: (value: number) => void) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current !== applied) last.current = null;
  }, [applied]);
  return (value: number) => {
    if (last.current === value) return;
    last.current = value;
    onChange(value);
  };
}

/** Full-width NumericRow matching the video-editor slider geometry. */
export function ReviewNumberRow(props: {
  label: string;
  unit?: CompactInspectorUnit;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  scrubStep?: number;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  const apply = useDedupedNumber(props.value, props.onChange);
  return (
    <NumericRow
      appearance="plain"
      className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
      label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      precision={props.precision}
      unit={props.unit}
      value={props.value}
      disabled={props.disabled}
      scrub={{ min: props.min, max: props.max, step: props.scrubStep ?? props.step }}
      onPreviewValue={apply}
      onCommitValue={apply}
    />
  );
}
