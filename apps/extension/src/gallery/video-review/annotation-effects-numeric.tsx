import { useRef } from 'react';
import { NumericRow, type NumericRowProps } from '../../ui/compact-inspector-controls';
type Scrub = NonNullable<NumericRowProps['scrub']>;
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';

type Patch = Partial<Omit<ReviewAnnotationEffect, 'id' | 'snapshotId' | 'order'>>;
type Editor = ReturnType<typeof useReviewAnnotationEffects>;

/** Numeric proposals use the annotation draft owner; shared controls only render and snap values. */
export function AnnotationNumeric(props: {
  editor: Editor;
  id: string;
  label: string;
  value: number;
  patch(value: number): Patch | null;
  disabled: boolean;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  unit?: 's' | '%' | 'deg' | undefined;
  scrub?: Scrub | undefined;
}) {
  const active = useRef(false);
  const cancelled = useRef(false);
  const frozen = useRef<Scrub | undefined>(undefined);
  const preview = (value: number) => {
    if (props.disabled || cancelled.current) return false;
    const patch = props.patch(value);
    if (!patch) return false;
    if (!active.current) {
      if (!props.editor.beginGesture(props.id)) return false;
      active.current = true;
      frozen.current = props.scrub;
    }
    props.editor.previewGesture(patch);
    return true;
  };
  const cancel = () => {
    cancelled.current = true;
    if (active.current) props.editor.cancelGesture();
    active.current = false;
    frozen.current = undefined;
  };
  return (
    <div
      onPointerDownCapture={() => {
        cancelled.current = false;
      }}
      onPointerCancelCapture={cancel}
      onFocusCapture={() => {
        cancelled.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        } else cancelled.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
    >
      <NumericRow
        appearance="plain"
        focusAppearance="accent-box"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        label={props.label}
        value={props.value}
        disabled={props.disabled}
        min={props.min}
        max={props.max}
        step={props.step}
        precision={2}
        unit={props.unit}
        scrub={active.current ? frozen.current : props.scrub}
        onPreviewValue={preview}
        onCommitValue={(value) => {
          if (!preview(value)) return;
          active.current = false;
          frozen.current = undefined;
          void props.editor.commitGesture();
        }}
      />
    </div>
  );
}

/** Keep the displayed admissible value on the practical track without rewriting authored geometry. */
export function annotationNumericScrub(
  value: number,
  min: number | undefined,
  max: number | undefined,
  step: number | undefined,
  practical?: { min: number; max: number }
): Scrub | undefined {
  if (
    min === undefined ||
    max === undefined ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max < min
  )
    return undefined;
  const low = practical ? Math.max(min, Math.min(value, practical.min)) : min;
  const high = practical ? Math.min(max, Math.max(value, practical.max)) : max;
  return low <= high ? { min: low, max: high, step } : undefined;
}

/** Placement tracks use practical percentages; timing and rotation retain their input bounds. */
export function annotationPlacementScrub(
  key: string,
  value: number,
  min: number | undefined,
  max: number | undefined,
  step: number
) {
  const practical =
    key === 'x' || key === 'y'
      ? { min: -100, max: 200 }
      : key === 'width' || key === 'height'
        ? { min: 0.01, max: 200 }
        : undefined;
  return annotationNumericScrub(value, min, max, step, practical);
}
