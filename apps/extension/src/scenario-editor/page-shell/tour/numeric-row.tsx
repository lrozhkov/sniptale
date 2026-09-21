import { useState } from 'react';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import type { CompactInspectorUnit } from '../../../ui/compact-inspector-controls/shared';

/**
 * Tour inspector numeric rows use the camera-settings pattern: a plain single-line
 * row with a hover scrub and a local preview that commits only normalized values.
 */
export function TourInspectorNumericRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  precision = 0,
  disabled,
  onPreview,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: CompactInspectorUnit;
  precision?: number;
  disabled: boolean;
  onPreview?: (value: number) => void;
  onChange: (value: number) => void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  return (
    <NumericRow
      appearance="plain"
      label={label}
      value={preview ?? value}
      min={min}
      max={max}
      step={step}
      unit={unit}
      precision={precision}
      scrub={{ min, max, step }}
      disabled={disabled}
      focusAppearance="quiet"
      onPreviewValue={(value) => {
        setPreview(value);
        onPreview?.(value);
      }}
      onCommitValue={(value) => {
        setPreview(null);
        onChange(value);
      }}
    />
  );
}
