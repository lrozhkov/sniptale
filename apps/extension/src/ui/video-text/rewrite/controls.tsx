import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { NumericRow } from '../../compact-inspector-controls';
import { InspectorDisclosureView } from '../../compact-inspector-controls/disclosure';
import type {
  CompactInspectorUnit,
  InspectorDisclosureProps,
} from '../../compact-inspector-controls/shared';
import { useInspectorDisclosure } from '../../../composition/inspector-disclosures/state';

/** Shared rewrite commands use the ordinary inspector command family. */
export function TextRewriteButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <ProductActionButton
      {...props}
      type="button"
      compact
      tone="secondary"
      title={label}
      aria-label={label}
      className={`!h-auto min-h-8! whitespace-normal text-left !text-xs ${className}`}
    >
      {children ?? label}
    </ProductActionButton>
  );
}

/** Rewrite details retain the existing inspector preference authority. */
export function TextRewriteDetails(props: InspectorDisclosureProps) {
  const [open, setOpen] = useInspectorDisclosure(props.preferenceId, props.initiallyOpen ?? false);
  return (
    <InspectorDisclosureView
      {...props}
      open={open}
      onOpenChange={setOpen}
      dataUi="video.text-rewrite.disclosure"
      variant="structural"
      bodyClassName="sniptale-parameter-stack px-2 pt-2"
    />
  );
}

/** Rewrite interval gestures commit once and preserve the accepted value on cancellation. */
export function TextRewriteNumberRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  unit?: CompactInspectorUnit;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  const [draft, setDraft] = useState(props.value);
  const cancelled = useRef(false);
  const initial = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current !== props.value) last.current = null;
  }, [props.value]);
  useEffect(() => setDraft(props.value), [props.value]);
  const cancel = () => {
    cancelled.current = true;
    initial.current = null;
    setDraft(props.value);
  };
  return (
    <div
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

        precision={props.precision}
        unit={props.unit}
        value={draft}
        disabled={props.disabled}
        scrub={{
          min: props.min,
          max: props.max,
          step: props.step,
        }}
        onPreviewValue={(value) => {
          if (!cancelled.current) {
            initial.current ??= props.value;
            setDraft(value);
          }
        }}
        onCommitValue={(value) => {
          if (cancelled.current) return;
          const baseline = initial.current ?? props.value;
          initial.current = null;
          setDraft(value);
          // An echoed preview is not authored; compare with the captured gesture origin.
          if (value === baseline || value === last.current) return;
          last.current = value;
          props.onChange(value);
        }}
      />
    </div>
  );
}
