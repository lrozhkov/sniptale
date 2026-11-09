import { useInspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { useRef } from 'react';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import type {
  CompactInspectorUnit,
  CompactInspectorNumericScrub,
} from '../../../../../ui/compact-inspector-controls/shared';
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
  scrubRange,
  revealScrub = false,
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
  scrubRange?: CompactInspectorNumericScrub | undefined;
  revealScrub?: boolean | undefined;
  disabled?: boolean;
}) {
  const gesture = useRef<'pointer' | 'keyboard' | null>(null);
  const inspector = useInspectorLayout();
  const finish = () => {
    gesture.current = null;
    onCommit?.();
  };
  const numericValue = Number.isFinite(value) ? value : 0;
  const commitValue = useDedupedNumberChange(onChange, numericValue);
  const scrubProps = scrubRange
    ? { scrub: scrubRange }
    : scrub && min !== undefined && max !== undefined
      ? { scrub: { min, max, step } }
      : {};

  const row = (
    <NumericRow
      appearance="plain"
      focusAppearance="accent-box"
      {...(inspector ? {} : { className: 'py-0! grid-cols-[minmax(0,1fr)_auto]!' })}
      label={label}
      value={numericValue}
      min={min}
      max={max}
      step={step}
      unit={unit}
      revealScrub={revealScrub}
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
