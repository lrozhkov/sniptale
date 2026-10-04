import { useRef } from 'react';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import type { CompactInspectorUnit } from '../../../../../ui/compact-inspector-controls/shared';
import { useDedupedNumberChange } from '../shared/number-commit';

export function NumberInput({
  value,
  onChange,
  onPreview,
  onCommit,
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
  onPreview?: () => void;
  onCommit?: () => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  scrub?: boolean;
  unit?: CompactInspectorUnit;
  disabled?: boolean;
}) {
  const gesture = useRef<'pointer' | 'keyboard' | null>(null);
  const finish = () => {
    gesture.current = null;
    onCommit?.();
  };
  const numericValue = Number.isFinite(value) ? value : 0;
  const commitValue = useDedupedNumberChange(onChange, numericValue);
  const scrubProps =
    scrub && min !== undefined && max !== undefined ? { scrub: { min, max, step } } : {};

  const row = (
    <NumericRow
      appearance="plain"
      focusAppearance="accent-box"
      className="py-0! grid-cols-[minmax(0,1fr)_auto]!"
      label={label}
      value={numericValue}
      min={min}
      max={max}
      step={step}
      unit={unit}
      disabled={disabled}
      onPreviewValue={(next) => {
        onPreview?.();
        commitValue(next);
      }}
      onCommitValue={(next) => {
        commitValue(next);
        if (!gesture.current) onCommit?.();
      }}
      {...scrubProps}
    />
  );
  return onCommit ? (
    <div
      onPointerDownCapture={(event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (disabled || !button) return;
        gesture.current = 'pointer';
        button.setPointerCapture?.(event.pointerId);
      }}
      onPointerUpCapture={finish}
      onPointerCancelCapture={finish}
      onLostPointerCapture={finish}
      onKeyDownCapture={(event) => {
        if (
          !disabled &&
          event.target instanceof HTMLButtonElement &&
          (event.key === 'Enter' || event.key === ' ')
        )
          gesture.current = 'keyboard';
      }}
      onKeyUpCapture={() => {
        if (gesture.current === 'keyboard') finish();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) finish();
      }}
    >
      {row}
    </div>
  ) : (
    row
  );
}
