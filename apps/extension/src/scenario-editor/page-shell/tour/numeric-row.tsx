import { useState } from 'react';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import type { CompactInspectorUnit } from '../../../ui/compact-inspector-controls/shared';

/**
 * Tour inspector numeric rows use the camera-settings pattern: a plain single-line
 * row with a contextual range or exact step and a local preview.
 */
export function TourInspectorNumericRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  precision = 0,
  scrub,
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
  scrub?: { min: number; max: number; step?: number } | false;
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
      scrub={scrub === false ? undefined : (scrub ?? { min, max, step })}
      keyboardStep={scrub === false}
      disabled={disabled}
      focusAppearance="accent-box"
      onPreviewValue={(value) => {
        setPreview(value);
        onPreview?.(value);
      }}
      onCancelValue={(origin) => {
        setPreview(null);
        if (origin !== null) onPreview?.(origin);
      }}
      onCommitValue={(value) => {
        setPreview(null);
        onChange(value);
      }}
    />
  );
}
