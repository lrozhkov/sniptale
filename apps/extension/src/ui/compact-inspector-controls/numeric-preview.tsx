import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { NumericRow } from './numeric';
import type { CompactInspectorUnit } from './shared';

/** Numeric gestures remain local until release or accepted text input. */
export function DraftNumericRow(props: {
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
  return <PreviewNumericRow {...props} />;
}

/** Numeric preview gestures share cancellation and commit ownership across effect inspectors. */
export function PreviewNumericRow(
  props: ComponentProps<typeof DraftNumericRow> & {
    onPreview?(value: number | null): void;
    title?: string;
    /** Optional external visual draft, separate from the supplied value. */
    previewValue?: number | undefined;
  }
) {
  const displayed = props.previewValue ?? props.value;
  const [draft, setDraft] = useState(displayed);
  const cancelled = useRef(false);
  const initial = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current !== props.value) last.current = null;
  }, [props.value]);
  useEffect(() => setDraft(displayed), [displayed]);
  const cancel = () => {
    cancelled.current = true;
    initial.current = null;
    setDraft(props.value);
    props.onPreview?.(null);
  };
  return (
    <div
      title={props.title}
      onPointerDownCapture={() => {
        cancelled.current = false;
        initial.current = props.value;
      }}
      onPointerCancelCapture={cancel}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          cancel();
          event.preventDefault();
        } else cancelled.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
    >
      <NumericRow
        appearance="plain"
        className="w-full"
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
            initial.current ??= props.value;
            setDraft(value);
            props.onPreview?.(value);
          }
        }}
        onCommitValue={(value) => {
          if (cancelled.current) return;
          const baseline = initial.current ?? props.value;
          initial.current = null;
          setDraft(value);
          props.onPreview?.(null);
          // An echoed preview is not authored; compare with the captured gesture origin.
          if (value === baseline || value === last.current) return;
          last.current = value;
          props.onChange(value);
        }}
      />
    </div>
  );
}
