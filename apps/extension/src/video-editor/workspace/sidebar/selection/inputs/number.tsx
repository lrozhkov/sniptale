import { useInspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { useRef } from 'react';
import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import type {
  CompactInspectorUnit,
  CompactInspectorNumericScrub,
} from '../../../../../ui/compact-inspector-controls/shared';
import { useInspectorNumericHistory } from '../shared/numeric-history';
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
  scrub = false,
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
  const previewing = useRef(false);
  const inspector = useInspectorLayout();
  const finish = () => {
    const active = gesture.current !== null || previewing.current;
    gesture.current = null;
    previewing.current = false;
    if (active) onCommit?.();
  };
  const numericValue = Number.isFinite(value) ? value : 0;
  const commitValue = useDedupedNumberChange(onChange, numericValue);
  const history = useInspectorNumericHistory(numericValue, commitValue, {
    disabled,
    onCancel: finish,
  });
  const blocked = disabled || history.disabled;
  const scrubProps = scrubRange
    ? { scrub: scrubRange }
    : scrub && min !== undefined && max !== undefined
      ? { scrub: { min, max, step } }
      : {};

  const row = (
    <NumericRow
      key={history.resetKey}
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
      disabled={blocked}
      onPreviewValue={(next) => {
        history.preview(() => {
          previewing.current = true;
          onPreview?.();
          commitValue(next);
        });
      }}
      onCommitValue={(next) => {
        if (!history.commit(() => commitValue(next))) return;
        if (gesture.current !== 'keyboard') {
          gesture.current = null;
          previewing.current = false;
          onCommit?.();
        }
      }}
      onCancelValue={() => {
        history.cancel();
        finish();
      }}
      {...scrubProps}
    />
  );
  return onCommit ? (
    <div
      onPointerDownCapture={(event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (blocked || !button) return;
        gesture.current = 'pointer';
        button.setPointerCapture?.(event.pointerId);
      }}
      onPointerUpCapture={finish}
      onPointerCancelCapture={finish}
      onLostPointerCapture={finish}
      onKeyDownCapture={(event) => {
        if (
          !blocked &&
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
