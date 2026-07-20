import type React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { clampNumber, FieldShell } from './field-shared';

const STEPPER_BUTTON_CLASS_NAME = [
  'flex h-[15px] w-5 items-center justify-center rounded-[5px]',
  'text-[color:var(--sniptale-color-text-muted)] transition',
  'hover:bg-[color:var(--sniptale-color-surface-hover)] hover:text-[color:var(--sniptale-color-accent)]',
].join(' ');

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function StepperButtons(props: {
  disabledDown?: boolean;
  disabledUp?: boolean;
  label: string;
  onStep: (direction: 1 | -1) => void;
}) {
  const { bindStepEvents } = useStepperRepeat(props.onStep);
  return (
    <div
      className={[
        'flex shrink-0 flex-col opacity-0 transition-opacity',
        'group-focus-within:opacity-100 group-hover:opacity-100',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label={`${props.label} ${translate('editor.compact.increaseAriaSuffix')}`}
        disabled={props.disabledUp}
        className={STEPPER_BUTTON_CLASS_NAME}
        {...bindStepEvents(1, props.disabledUp)}
      >
        <ChevronUp size={11} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        aria-label={`${props.label} ${translate('editor.compact.decreaseAriaSuffix')}`}
        disabled={props.disabledDown}
        className={STEPPER_BUTTON_CLASS_NAME}
        {...bindStepEvents(-1, props.disabledDown)}
      >
        <ChevronDown size={11} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function useStepperRepeat(onStep: (direction: 1 | -1) => void) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stopRepeat = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  const startRepeat = (direction: 1 | -1) => {
    stopRepeat();
    onStep(direction);
    timeoutRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => onStep(direction), 85);
    }, 280);
  };

  useEffect(() => stopRepeat, []);

  const bindStepEvents = (direction: 1 | -1, disabled?: boolean) => ({
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled || (event.key !== 'Enter' && event.key !== ' ')) {
        return;
      }
      event.preventDefault();
      onStep(direction);
    },
    onLostPointerCapture: stopRepeat,
    onPointerCancel: stopRepeat,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startRepeat(direction);
    },
    onPointerUp: stopRepeat,
  });

  return { bindStepEvents };
}

export function NumberField(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const field = useNumberFieldState(props);
  return (
    <FieldShell label={props.label}>
      <div
        className={[
          'group flex items-center gap-1 rounded-[8px] border px-2 transition',
          'border-[color:var(--sniptale-color-border-soft)]',
          'focus-within:border-[color:var(--sniptale-color-border-accent-strong)]',
        ].join(' ')}
      >
        <NumberFieldInput label={props.label} field={field} />
        <StepperButtons
          label={props.label}
          disabledDown={props.min !== undefined && field.value <= props.min}
          disabledUp={props.max !== undefined && field.value >= props.max}
          onStep={field.applyStep}
        />
      </div>
    </FieldShell>
  );
}

function useNumberFieldState(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const step = props.step ?? 1;
  const value = Number.isFinite(props.value) ? props.value : 0;
  const [draft, setDraft] = useState(formatNumber(value));
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
    setDraft(formatNumber(value));
  }, [value]);
  const commitDraft = () => {
    const next = Number(draft);
    if (Number.isFinite(next)) {
      props.onChange(clampNumber(next, props.min, props.max));
    } else {
      setDraft(formatNumber(value));
    }
  };
  const applyStep = (direction: 1 | -1) => {
    const next = clampNumber(valueRef.current + step * direction, props.min, props.max);
    valueRef.current = next;
    setDraft(formatNumber(next));
    props.onChange(next);
  };
  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    const next = Number(nextDraft);
    if (nextDraft !== '' && Number.isFinite(next)) {
      const clamped = clampNumber(next, props.min, props.max);
      valueRef.current = clamped;
      props.onChange(clamped);
    }
  };
  return { applyStep, commitDraft, draft, setDraft, updateDraft, value };
}

function NumberFieldInput(props: { field: ReturnType<typeof useNumberFieldState>; label: string }) {
  const { field } = props;
  return (
    <input
      aria-label={props.label}
      inputMode="decimal"
      type="text"
      value={field.draft}
      onChange={(event) => field.updateDraft(event.currentTarget.value)}
      onBlur={field.commitDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          field.commitDraft();
        } else if (event.key === 'Escape') {
          field.setDraft(formatNumber(field.value));
        }
      }}
      className={[
        'h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[12px]',
        'font-medium text-[color:var(--sniptale-color-text-primary)] outline-none',
      ].join(' ')}
    />
  );
}
