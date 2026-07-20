import { type PointerEvent, useState } from 'react';
import { cx, type CompactInspectorNumericScrub, type CompactInspectorUnit } from './shared';
import { NumericRangeScrub } from './numeric-range-scrub';
import { NumericStepper } from './stepper';
import { useNumericValueFieldState } from './numeric-value-state';

const NUMERIC_ROW_RANGE_HOT_EDGE_PX = 12;

export interface NumericValueFieldProps {
  className?: string | undefined;
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  label: string;
  max?: number | undefined;
  min?: number | undefined;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  precision?: number | undefined;
  scrub?: CompactInspectorNumericScrub | undefined;
  step?: number | undefined;
  unit?: CompactInspectorUnit | undefined;
  value: number | null;
}

export function NumericValueField(props: NumericValueFieldProps) {
  const step = props.step ?? 1;
  const unit = props.unit ?? '';
  const state = useNumericValueFieldState({
    max: props.max,
    min: props.min,
    onCommitValue: props.onCommitValue,
    onPreviewValue: props.onPreviewValue,
    precision: props.precision,
    step,
    unit,
    value: props.value,
  });

  return <NumericValueFieldView props={props} state={state} />;
}

function NumericValueFieldView({
  props,
  state,
}: {
  props: NumericValueFieldProps;
  state: ReturnType<typeof useNumericValueFieldState>;
}) {
  return (
    <div
      data-ui="shared.ui.compact-inspector.numeric-value-field"
      className={cx(
        'group/compact-numeric relative flex h-8 w-[6.25rem] shrink-0 items-center gap-0',
        'rounded-[7px] px-2 transition-[border-color,background-color]',
        'border border-transparent bg-transparent',
        'focus-within:border-[color:var(--sniptale-color-border-accent-strong)]',
        'focus-within:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_70%,transparent)]',
        props.invalid &&
          'border-[color:var(--sniptale-color-danger)] text-[color:var(--sniptale-color-danger)]',
        props.disabled && 'cursor-not-allowed opacity-55',
        props.className
      )}
    >
      <NumericValueInput props={props} state={state} />
      <NumericUnitLabel state={state} />
      <NumericStepper disabled={props.disabled} label={props.label} onStep={state.applyStep} />
    </div>
  );
}

function NumericValueInput({
  props,
  state,
}: {
  props: NumericValueFieldProps;
  state: ReturnType<typeof useNumericValueFieldState>;
}) {
  return (
    <input
      ref={state.inputRef}
      aria-label={props.label}
      disabled={props.disabled}
      inputMode="decimal"
      type="text"
      value={state.draft}
      placeholder={props.value === null ? '—' : undefined}
      onFocus={(event) => state.handleFocus(event, props.disabled === true)}
      onChange={state.handleChange}
      onBlur={state.commitDraft}
      onKeyDown={state.handleKeyDown}
      onPointerDown={state.handlePointerDown}
      className={cx(
        'h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-right',
        'text-[12px] font-semibold text-inherit outline-none'
      )}
    />
  );
}

function NumericUnitLabel({ state }: { state: ReturnType<typeof useNumericValueFieldState> }) {
  const focused =
    typeof document !== 'undefined' && document.activeElement === state.inputRef.current;
  if (!state.unitLabel || state.editing || focused) {
    return null;
  }

  return (
    <span className="shrink-0 text-[12px] font-semibold text-[color:var(--sniptale-color-text-primary)]">
      {state.unitLabel}
    </span>
  );
}

export interface NumericRowProps extends NumericValueFieldProps {
  className?: string;
  labelVisible?: boolean;
}

export function NumericRow({
  className,
  label,
  labelVisible = true,
  scrub,
  ...props
}: NumericRowProps) {
  const range = useNumericRowRangeState(scrub, props.disabled);

  return (
    <div
      data-ui="shared.ui.compact-inspector.numeric-row"
      data-range-visible={range.visible ? 'true' : 'false'}
      onPointerMove={range.handlePointerMove}
      onPointerLeave={range.hide}
      className={cx(
        [
          'group/compact-numeric-row relative flex min-h-10 items-center justify-between',
          'gap-3 rounded-[10px] border px-3 py-1.5',
        ].join(' '),
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        className
      )}
    >
      {labelVisible ? <NumericRowLabel label={label} /> : null}
      <NumericValueField label={label} {...props} />
      {scrub ? (
        <NumericRangeScrub
          active={range.active}
          disabled={props.disabled}
          label={label}
          onActiveChange={range.setActive}
          onCommitValue={props.onCommitValue}
          onPreviewValue={props.onPreviewValue}
          scrub={scrub}
          step={props.step}
          value={props.value}
          visible={range.visible}
        />
      ) : null}
    </div>
  );
}

function useNumericRowRangeState(
  scrub: CompactInspectorNumericScrub | undefined,
  disabled: boolean | undefined
) {
  const [hot, setHot] = useState(false);
  const [active, setActive] = useState(false);
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrub || disabled) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHot(rect.bottom - event.clientY <= NUMERIC_ROW_RANGE_HOT_EDGE_PX);
  };
  const hide = () => {
    setHot(false);
  };

  return { active, handlePointerMove, hide, setActive, visible: hot || active };
}

function NumericRowLabel({ label }: { label: string }) {
  return (
    <span
      className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[color:var(--sniptale-color-text-secondary)]"
      title={label}
    >
      {label}
    </span>
  );
}
