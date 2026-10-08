import { useEffect, useRef, useState, type ComponentProps } from 'react';
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
  enterBehavior?: ComponentProps<typeof NumericRow>['enterBehavior'];
  scrubStep?: number;
  scrubMax?: number;
  scrubMin?: number;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  const apply = useDedupedNumber(props.value, props.onChange);
  return (
    <NumericRow
      appearance="plain"
      focusAppearance="accent-box"
      className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
      label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      enterBehavior={props.enterBehavior}
      precision={props.precision}
      unit={props.unit}
      value={props.value}
      disabled={props.disabled}
      scrub={{
        min: props.scrubMin ?? props.min,
        max: props.scrubMax ?? props.max,
        step: props.scrubStep ?? props.step,
      }}
      onPreviewValue={apply}
      onCommitValue={apply}
    />
  );
}

/** Numeric preview gestures share cancellation and commit ownership across effect inspectors. */
export function ReviewPreviewNumberRow(
  props: ComponentProps<typeof ReviewNumberRow> & {
    onPreview?(value: number | null): void;
    title?: string;
    /** Optional external visual draft, separate from the supplied value. */
    previewValue?: number | undefined;
  }
) {
  const displayed = props.previewValue ?? props.value;
  const [draft, setDraft] = useState(displayed);
  const cancelled = useRef(false);
  useEffect(() => setDraft(displayed), [displayed]);
  const cancel = () => {
    cancelled.current = true;
    setDraft(props.value);
    props.onPreview?.(null);
  };
  return (
    <div
      title={props.title}
      onPointerDownCapture={() => {
        cancelled.current = false;
      }}
      onPointerCancelCapture={cancel}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          cancel();
          event.preventDefault();
          event.stopPropagation();
        } else cancelled.current = false;
      }}
    >
      <NumericRow
        appearance="plain"
        focusAppearance="accent-box"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        enterBehavior={props.enterBehavior}
        precision={props.precision}
        unit={props.unit}
        value={draft}
        disabled={props.disabled}
        scrub={{
          min: props.scrubMin ?? props.min,
          max: props.scrubMax ?? props.max,
          step: props.scrubStep ?? props.step,
        }}
        onPreviewValue={(value) => {
          if (!cancelled.current) {
            setDraft(value);
            props.onPreview?.(value);
          }
        }}
        onCommitValue={(value) => {
          if (cancelled.current) return;
          setDraft(value);
          props.onPreview?.(null);
          // Parent value may already echo this gesture's preview, not a durable edit.
          props.onChange(value);
        }}
      />
    </div>
  );
}
