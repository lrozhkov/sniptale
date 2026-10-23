import { useId, useState } from 'react';
import { translate } from '../../platform/i18n';
import {
  COMPACT_INLINE_VALUE_SURFACE_CLASS_NAME,
  COMPACT_INLINE_VALUE_FOCUS_CLASS_NAME,
  COMPACT_INLINE_VALUE_INPUT_CLASS_NAME,
} from './interactive-control-style';
import { cx, type CompactInspectorNumericScrub, type CompactInspectorUnit } from './shared';
import { NumericRangeScrub } from './numeric-range-scrub';
import { NumericStepper } from './stepper';
import { useNumericValueFieldState } from './numeric-value-state';
import { TextWithOverflowHint } from './overflow-hint';
import { useInspectorLayout } from './layout';

export interface NumericValueFieldProps {
  /** Enter commits then advances by default; blur ends an isolated inspector edit. */
  enterBehavior?: 'next' | 'blur' | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  /** Focus presentation: 'accent-box' draws an accent border box, 'quiet' a thin accent line. */
  focusAppearance?: 'accent-box' | 'quiet' | undefined;
  invalid?: boolean | undefined;
  label: string;
  max?: number | undefined;
  min?: number | undefined;
  normalizeValue?: ((value: number) => number) | undefined;
  /** Optional domain step mapping, e.g. the next irregular media boundary. */
  getStepValue?: ((value: number, direction: 1 | -1) => number) | undefined;
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
    enterBehavior: props.enterBehavior,
    max: props.max,
    min: props.min,
    normalizeValue: props.normalizeValue,
    getStepValue: props.getStepValue,
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
  const quietFocus = props.focusAppearance === 'quiet';
  const inspector = useInspectorLayout();
  const [pointerFocus, setPointerFocus] = useState(false);
  const value = (
    <>
      <NumericValueInput
        props={props}
        state={state}
        pointerFocus={pointerFocus}
        setPointerFocus={setPointerFocus}
      />
      <NumericUnitLabel state={state} />
    </>
  );
  return (
    <div
      data-ui="shared.ui.compact-inspector.numeric-value-field"
      data-focus-appearance={props.focusAppearance ?? 'accent-box'}
      className={cx(
        'group/compact-numeric relative flex',
        'w-[6.25rem] shrink-0 items-center',
        'gap-0',
        inspector ? 'sniptale-numeric-value' : COMPACT_INLINE_VALUE_SURFACE_CLASS_NAME,
        !inspector && !quietFocus && COMPACT_INLINE_VALUE_FOCUS_CLASS_NAME,
        props.invalid &&
          'border-[color:var(--sniptale-color-danger)] text-[color:var(--sniptale-color-danger)]',
        props.disabled && 'cursor-not-allowed opacity-55',
        props.className
      )}
    >
      {inspector ? (
        <span
          className="sniptale-numeric-entry"
          onPointerDown={(event) => {
            if (event.button !== 0 || props.disabled || event.target === state.inputRef.current)
              return;
            event.preventDefault();
            setPointerFocus(true);
            state.inputRef.current?.focus();
          }}
        >
          {value}
        </span>
      ) : (
        value
      )}
      <NumericStepper disabled={props.disabled} label={props.label} onStep={state.applyStep} />
      {quietFocus && !inspector && (
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-x-1 bottom-0 h-px',
            'bg-[color:var(--sniptale-color-accent)] opacity-0 transition-opacity',
            'group-focus-within/compact-numeric:opacity-60',
          ].join(' ')}
        />
      )}
    </div>
  );
}

function NumericValueInput({
  props,
  state,
  pointerFocus,
  setPointerFocus,
}: {
  props: NumericValueFieldProps;
  state: ReturnType<typeof useNumericValueFieldState>;
  pointerFocus: boolean;
  setPointerFocus(value: boolean): void;
}) {
  return (
    <input
      ref={state.inputRef}
      data-pointer-focus={pointerFocus || undefined}
      aria-label={props.label}
      disabled={props.disabled}
      inputMode="decimal"
      size={Math.max(1, state.draft.length)}
      type="text"
      value={state.draft}
      placeholder={props.value === null ? '—' : undefined}
      onFocus={(event) => state.handleFocus(event, props.disabled === true)}
      onChange={state.handleChange}
      onBlur={() => {
        setPointerFocus(false);
        state.commitDraft();
      }}
      onKeyDown={(event) => {
        setPointerFocus(false);
        state.handleKeyDown(event);
      }}
      onPointerDown={(event) => {
        setPointerFocus(true);
        state.handlePointerDown(event);
      }}
      className={COMPACT_INLINE_VALUE_INPUT_CLASS_NAME}
    />
  );
}

function NumericUnitLabel({ state }: { state: ReturnType<typeof useNumericValueFieldState> }) {
  if (!state.unitLabel) {
    return null;
  }

  return (
    <span
      className={[
        'shrink-0 text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
        'text-[color:var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      {state.unitLabel}
    </span>
  );
}

/** Hosts may inherit compact font/height CSS variables; unset values retain shared defaults. */
export interface NumericRowProps extends NumericValueFieldProps {
  appearance?: 'surface' | 'plain';
  className?: string;
  labelVisible?: boolean;
  revealScrub?: boolean;
}

export function NumericRow({
  appearance = 'surface',
  className,
  label,
  labelVisible = true,
  revealScrub = false,
  scrub,
  ...props
}: NumericRowProps) {
  const range = useNumericRowRangeState(scrub, props.disabled, revealScrub);
  const inspector = useInspectorLayout();
  const scaleNoteId = useId();
  const scrubValue = scrub?.value ?? props.value;
  const outOfScale = Boolean(
    scrub &&
    scrubValue !== null &&
    scrubValue !== undefined &&
    (scrubValue < scrub.min || scrubValue > scrub.max)
  );

  return (
    <div
      data-ui="shared.ui.compact-inspector.numeric-row"
      data-out-of-scale={outOfScale ? 'true' : undefined}
      data-appearance={appearance}
      data-range-visible={range.visible ? 'true' : 'false'}
      data-has-scrub={scrub ? 'true' : undefined}
      data-layout={inspector ? 'inline' : undefined}
      onPointerMove={range.show}
      onPointerLeave={range.hide}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === 'text')
          range.setTextFocused(true);
      }}
      onBlurCapture={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === 'text')
          range.setTextFocused(false);
      }}
      className={cx(
        'group/compact-numeric-row relative min-h-10 items-center gap-2',
        appearance === 'surface' &&
          [
            'flex justify-between gap-3 rounded-[10px] border px-3 py-1.5',
            'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
          ].join(' '),
        appearance === 'plain' && 'grid grid-cols-[7.5rem_minmax(0,1fr)] py-0.5',
        className,
        inspector && 'sniptale-parameter-row'
      )}
    >
      {labelVisible ? <NumericRowLabel appearance={appearance} label={label} /> : null}
      {appearance === 'plain' ? (
        <div className={cx('min-w-0 justify-self-end', !labelVisible && 'col-start-2')}>
          <NumericValueField label={label} {...props} />
        </div>
      ) : (
        <NumericValueField label={label} {...props} />
      )}
      {scrub ? (
        <NumericRangeScrub
          active={range.active}
          outOfScale={outOfScale}
          descriptionId={outOfScale ? scaleNoteId : undefined}
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
      {outOfScale ? (
        <p id={scaleNoteId} className="sniptale-numeric-scale-note">
          {translate('shared.ui.numericOutsideSliderRange')}
        </p>
      ) : null}
    </div>
  );
}

function useNumericRowRangeState(
  scrub: CompactInspectorNumericScrub | undefined,
  disabled: boolean | undefined,
  revealScrub: boolean
) {
  const [hot, setHot] = useState(false);
  const [active, setActive] = useState(false);
  const [textFocused, setTextFocused] = useState(false);
  const show = () => {
    if (!scrub || disabled) {
      return;
    }
    setHot(true);
  };
  const hide = () => {
    setHot(false);
  };

  return {
    active,
    hide,
    setActive,
    setTextFocused,
    show,
    visible: !disabled && (revealScrub || (!textFocused && (hot || active))),
  };
}

function NumericRowLabel({
  appearance,
  label,
}: {
  appearance: 'surface' | 'plain';
  label: string;
}) {
  const inspector = useInspectorLayout();
  return (
    <TextWithOverflowHint
      className={cx(
        'sniptale-interface-label',
        'min-w-0 truncate font-semibold text-[color:var(--sniptale-color-text-secondary)]',
        appearance === 'plain'
          ? 'text-[length:var(--sniptale-compact-font-size,11px)]'
          : 'flex-1 text-[length:var(--sniptale-compact-font-size,12px)]',
        inspector && 'sniptale-parameter-name'
      )}
      text={label}
    />
  );
}
