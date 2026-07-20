import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { CompactInput } from '../../../../ui/compact-inspector-controls';
import {
  isCssNumericLength,
  normalizeCssLengthInput,
  splitCssLength,
  stepCssLength,
} from './css-length';
import { Field } from './fields';

const NUMERIC_STEPPER_CLASS_NAME = [
  'absolute right-1 top-1/2 grid h-8 w-6 -translate-y-1/2 overflow-hidden rounded-[7px]',
  'border border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
  'opacity-0 transition-opacity group-hover/number:opacity-100 group-focus-within/number:opacity-100',
].join(' ');

const NUMERIC_STEPPER_BUTTON_CLASS_NAME = [
  'inline-flex items-center justify-center',
  'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-accent)]',
].join(' ');

function NumericStepperButton(props: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onStep: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={NUMERIC_STEPPER_BUTTON_CLASS_NAME}
      aria-label={props.label}
      onClick={(event) => {
        event.preventDefault();
        props.onStep();
      }}
    >
      {props.children}
    </button>
  );
}

function NumericStepper(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className={NUMERIC_STEPPER_CLASS_NAME}>
      <NumericStepperButton
        disabled={props.disabled}
        label={`${props.label}: +1`}
        onStep={() => props.onChange(stepCssLength(props.value, props.defaultValue, 1))}
      >
        <ChevronUp size={12} />
      </NumericStepperButton>
      <NumericStepperButton
        disabled={props.disabled}
        label={`${props.label}: -1`}
        onStep={() => props.onChange(stepCssLength(props.value, props.defaultValue, -1))}
      >
        <ChevronDown size={12} />
      </NumericStepperButton>
    </div>
  );
}

type NumericFieldProps = {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  value: string;
};

function NumericFieldInput(props: NumericFieldProps) {
  const { numberText, unit } = splitCssLength(props.value);
  const fallbackUnit = splitCssLength(props.defaultValue ?? '').unit;
  const showUnit =
    isCssNumericLength(props.value) || (!props.value.trim() && Boolean(fallbackUnit));
  const inputValue = showUnit ? numberText : props.value;
  const displayedUnit = unit || fallbackUnit || 'px';

  return (
    <div className="group/number relative min-w-0">
      <CompactInput
        aria-label={props.label}
        className={showUnit ? 'pr-16' : 'pr-8'}
        disabled={props.disabled}
        inputMode="decimal"
        value={inputValue}
        onChange={(event) => {
          const rawValue = event.currentTarget.value;
          props.onChange(
            showUnit
              ? `${rawValue}${displayedUnit}`
              : normalizeCssLengthInput(rawValue, props.defaultValue)
          );
        }}
      />
      {showUnit ? <NumericUnitLabel unit={displayedUnit} /> : null}
      <NumericStepper
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        label={props.label}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}

function NumericUnitLabel(props: { unit: string }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute right-10 top-1/2 -translate-y-1/2',
        'text-[11px] font-semibold text-[var(--sniptale-color-text-dim)]',
      ].join(' ')}
    >
      {props.unit}
    </span>
  );
}

export function NumericField(props: NumericFieldProps) {
  return (
    <Field
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <NumericFieldInput {...props} />
    </Field>
  );
}
