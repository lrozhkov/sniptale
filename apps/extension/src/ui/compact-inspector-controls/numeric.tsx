import {
  memo,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { NumberInput } from '@sniptale/ui/number-input';
import { translate } from '../../platform/i18n';
import { COMPACT_INLINE_VALUE_INPUT_CLASS_NAME } from './interactive-control-style';
import { cx, type CompactInspectorNumericScrub, type CompactInspectorUnit } from './shared';
import { NumericRangeScrub } from './numeric-range-scrub';
import { OpacityField } from './inspector-numeric-fields';
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
  /** Let unmodified Up and Down apply the field's existing exact step. */
  keyboardStep?: boolean | undefined;
  stepperPlacement?: 'sides' | 'none' | undefined;
  label: string;
  max?: number | undefined;
  min?: number | undefined;
  normalizeValue?: ((value: number) => number) | undefined;
  /** Optional domain step mapping, e.g. the next irregular media boundary. */
  getStepValue?: ((value: number, direction: 1 | -1) => number) | undefined;
  onCommitValue: (value: number) => void;
  onPreviewValue: (value: number) => void;
  /** Release a consumer-owned preview after a canceled or unchanged stepper hold. */
  onCancelValue?: ((origin: number | null) => void) | undefined;
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
    onCancelValue: props.onCancelValue,
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
  const [pointerFocus, setPointerFocus] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const committedState = useRef(state);
  useLayoutEffect(() => {
    committedState.current = state;
  }, [state]);
  const showStepper = props.stepperPlacement !== 'none';
  const stepWithWheel = useEffectEvent((event: WheelEvent) => {
    if (
      props.disabled ||
      !state.inputRef.current?.matches(':focus') ||
      event.defaultPrevented ||
      !event.cancelable ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    state.applyStep(event.deltaY < 0 ? 1 : -1);
  });
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => stepWithWheel(event);
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);
  const value = (
    <>
      <NumericValueInput
        label={props.label}
        draft={state.draft}
        mixed={props.value === null}
        disabled={props.disabled === true}
        keyboardStep={props.keyboardStep !== false}
        stateRef={committedState}
        pointerFocus={pointerFocus}
        setPointerFocus={setPointerFocus}
      />
      <NumericUnitLabel state={state} />
    </>
  );
  return (
    <div
      ref={frame}
      data-ui="shared.ui.compact-inspector.numeric-value-field"
      data-stepper-placement={showStepper ? 'sides' : undefined}
      data-focus-appearance={props.focusAppearance ?? 'accent-box'}
      className={cx(
        'group/compact-numeric relative flex',
        'w-[6.25rem] shrink-0 items-center',
        'gap-0',
        'sniptale-numeric-value',
        showStepper && 'sniptale-framed-stepper',
        props.invalid &&
          'border-[color:var(--sniptale-color-danger)] text-[color:var(--sniptale-color-danger)]',
        props.disabled && 'cursor-not-allowed opacity-55',
        props.className
      )}
    >
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
      {showStepper ? (
        <NumericStepper
          disabled={props.disabled}
          label={props.label}
          onStep={state.previewStep}
          onFinish={state.finishStep}
          onCancel={state.cancelStep}
        />
      ) : null}
    </div>
  );
}

const NumericValueInput = memo(function NumericValueInput({
  label,
  draft,
  mixed,
  disabled,
  keyboardStep,
  stateRef,
  pointerFocus,
  setPointerFocus,
}: {
  label: string;
  draft: string;
  mixed: boolean;
  disabled: boolean;
  keyboardStep: boolean;
  stateRef: RefObject<ReturnType<typeof useNumericValueFieldState>>;
  pointerFocus: boolean;
  setPointerFocus(value: boolean): void;
}) {
  return (
    <NumberInput
      ref={stateRef.current.inputRef}
      data-pointer-focus={pointerFocus || undefined}
      aria-label={label}
      disabled={disabled}
      inputMode="decimal"
      size={Math.max(1, draft.length)}
      type="text"
      value={draft}
      placeholder={mixed ? '—' : undefined}
      onFocus={(event) => stateRef.current.handleFocus(event, disabled)}
      onChange={(event) => stateRef.current.handleChange(event)}
      onBlur={() => {
        setPointerFocus(false);
        stateRef.current.commitDraft();
      }}
      onKeyDown={(event) => {
        setPointerFocus(false);
        if (
          keyboardStep &&
          !disabled &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          event.preventDefault();
          event.stopPropagation();
          stateRef.current.applyStep(event.key === 'ArrowUp' ? 1 : -1);
          return;
        }
        stateRef.current.handleKeyDown(event);
      }}
      onPointerDown={(event) => {
        setPointerFocus(true);
        stateRef.current.handlePointerDown(event);
      }}
      className={COMPACT_INLINE_VALUE_INPUT_CLASS_NAME}
    />
  );
});

function NumericUnitLabel({ state }: { state: ReturnType<typeof useNumericValueFieldState> }) {
  if (!state.unitLabel) {
    return null;
  }

  return <span className="sniptale-numeric-unit">{state.unitLabel}</span>;
}

/** Hosts may inherit compact font/height CSS variables; unset values retain shared defaults. */
export interface NumericRowProps extends NumericValueFieldProps {
  appearance?: 'surface' | 'plain';
  className?: string;
  labelVisible?: boolean;
  revealScrub?: boolean;
  rangePresentation?: 'field' | undefined;
}

export function NumericRow({
  appearance = 'surface',
  className,
  label,
  labelVisible = true,
  revealScrub = false,
  rangePresentation,
  scrub: requestedScrub,
  ...props
}: NumericRowProps) {
  const inspector = useInspectorLayout();
  const value = props.value;
  const inlineRange =
    appearance === 'plain' &&
    rangePresentation === 'field' &&
    requestedScrub &&
    requestedScrub.min < requestedScrub.max &&
    requestedScrub.toValue === undefined &&
    requestedScrub.value === undefined &&
    (props.min === undefined || props.min === requestedScrub.min) &&
    (props.max === undefined || props.max === requestedScrub.max) &&
    value !== null &&
    props.getStepValue === undefined;
  const scrub = inlineRange ? undefined : requestedScrub;
  const range = useNumericRowRangeState(scrub, props.disabled, revealScrub);
  const scaleNoteId = useId();
  const scrubValue = scrub?.value ?? props.value;
  const outOfScale = Boolean(
    scrub &&
    scrubValue !== null &&
    scrubValue !== undefined &&
    (scrubValue < scrub.min || scrubValue > scrub.max)
  );
  const rangeControl = scrub ? (
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
  ) : null;

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
        'group/compact-numeric-row relative min-h-8 items-center gap-2',
        appearance === 'surface' && 'flex justify-between',
        appearance === 'plain' && 'grid grid-cols-[7.5rem_minmax(0,1fr)] py-0.5',
        className,
        inspector && 'sniptale-parameter-row'
      )}
    >
      {labelVisible ? <NumericRowLabel appearance={appearance} label={label} /> : null}
      {appearance === 'plain' ? (
        <div
          className={cx(
            'min-w-0 justify-self-end',
            inspector && 'sniptale-parameter-value',
            inlineRange && !inspector && 'w-full max-w-40',
            !labelVisible && 'col-start-2'
          )}
        >
          {inlineRange ? (
            <OpacityField
              label={label}
              value={value}
              unit={props.unit ?? ''}
              min={requestedScrub.min}
              max={requestedScrub.max}
              step={props.step}
              scrubStep={requestedScrub.step}
              precision={props.precision}
              fractional
              disabled={props.disabled === true}
              copy={{
                apply: translate('common.actions.save'),
                editOpacity: label,
                invalid: (max, min) => `${label} (${min}–${max})`,
              }}
              onChange={(value) => props.onCommitValue(props.normalizeValue?.(value) ?? value)}
              onPreview={props.onPreviewValue}
              onCancel={(start) => {
                if (props.onCancelValue) props.onCancelValue(start);
                else props.onPreviewValue(start);
              }}
            />
          ) : (
            <NumericValueField
              label={label}
              {...props}
              stepperPlacement={props.stepperPlacement ?? (scrub ? 'none' : undefined)}
            />
          )}
        </div>
      ) : (
        <NumericValueField
          label={label}
          {...props}
          stepperPlacement={props.stepperPlacement ?? (scrub ? 'none' : undefined)}
        />
      )}
      {rangeControl}
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
