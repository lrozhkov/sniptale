import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent, RefObject } from 'react';
import './picker.css';

type PickerNumberFieldProps = {
  ariaLabel: string;
  value: number | string;
  onChange: (value: string) => void;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  prefix?: string | undefined;
  unit?: string | undefined;
  cyclic?: boolean | undefined;
  disabled?: boolean | undefined;
};

function normalizeNumber(value: number, props: PickerNumberFieldProps) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  if (!props.cyclic) return Math.max(min, Math.min(max, value));
  const span = max - min + (props.step ?? 1);
  return ((((value - min) % span) + span) % span) + min;
}

function invalidNumberDraft(draft: string, props: PickerNumberFieldProps) {
  const value = Number(draft);
  if (draft === '' || !Number.isFinite(value)) return true;
  const steps = (value - (props.min ?? 0)) / (props.step ?? 1);
  if (Math.abs(steps - Math.round(steps)) > 1e-7) return true;
  return !props.cyclic && (value < (props.min ?? 0) || value > (props.max ?? 100));
}

function keepFocusedAngle(input: HTMLInputElement | null, props: PickerNumberFieldProps) {
  if (!props.cyclic || !input || input !== input.ownerDocument.activeElement) return false;
  if (input.value === '' || !Number.isFinite(Number(input.value))) return false;
  return normalizeNumber(Number(input.value), props) === Number(props.value);
}

function useNumberEditing(props: PickerNumberFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(props.value));
  const session = useRef({ options: props, value: Number(props.value) });
  session.current.options = props;
  session.current.value = draft === '' ? Number(props.value) : Number(draft);
  useEffect(() => {
    if (!keepFocusedAngle(input.current, session.current.options))
      setDraft(String(session.current.options.value));
  }, [props.value, props.cyclic, props.min, props.max, props.step]);

  const changeStep = (direction: number, multiplier = 1) => {
    const options = session.current.options;
    if (options.disabled) return false;
    const currentValue = Number.isFinite(session.current.value)
      ? session.current.value
      : (options.min ?? 0);
    const value = normalizeNumber(
      currentValue + direction * (options.step ?? 1) * multiplier,
      options
    );
    if (value === session.current.value) return false;
    session.current.value = value;
    const text = String(Number(value.toFixed(6)));
    setDraft(text);
    options.onChange(text);
    return true;
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setDraft(value);
    if (value !== '' && event.target.validity.valid) session.current.options.onChange(value);
  };
  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.target.value === '' || !event.target.validity.valid) return;
    const value = Number(event.target.value);
    if (session.current.options.cyclic && Number.isFinite(value)) {
      const normalized = String(normalizeNumber(value, session.current.options));
      setDraft(normalized);
      session.current.options.onChange(normalized);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    changeStep(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1);
  };
  return {
    input,
    draft,
    invalid: invalidNumberDraft(draft, props),
    changeStep,
    onChange,
    onBlur,
    onKeyDown,
  };
}

function useNumberHold(
  input: RefObject<HTMLInputElement | null>,
  step: (direction: number) => boolean,
  disabled = false
) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; step: typeof step }>({
    timer: null,
    step,
  });
  hold.current.step = step;
  const keyboard = useRef<{
    key: string | null;
    clickTimer: ReturnType<typeof setTimeout> | null;
    suppressClick: boolean;
  }>({ key: null, clickTimer: null, suppressClick: false });
  const stop = useCallback(() => {
    if (hold.current.timer !== null) clearTimeout(hold.current.timer);
    hold.current.timer = null;
    keyboard.current.key = null;
    keyboard.current.suppressClick = false;
    if (keyboard.current.clickTimer !== null) clearTimeout(keyboard.current.clickTimer);
    keyboard.current.clickTimer = null;
  }, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);
  useEffect(() => {
    const view = input.current?.ownerDocument.defaultView;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') stop();
    };
    view?.addEventListener('blur', stop);
    view?.addEventListener('pointerup', stop);
    view?.addEventListener('pointercancel', stop);
    view?.addEventListener('keydown', escape);
    return () => {
      stop();
      view?.removeEventListener('blur', stop);
      view?.removeEventListener('pointerup', stop);
      view?.removeEventListener('pointercancel', stop);
      view?.removeEventListener('keydown', escape);
    };
  }, [input, stop]);
  const start = (direction: number) => {
    stop();
    if (!hold.current.step(direction)) return;
    let repeats = 0;
    const repeat = () => {
      if (!hold.current.step(direction)) {
        stop();
        return;
      }
      repeats += 1;
      hold.current.timer = setTimeout(repeat, Math.max(35, 160 - repeats * 12));
    };
    hold.current.timer = setTimeout(repeat, 280);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, direction: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (disabled || event.repeat || keyboard.current.key !== null) return;
    start(direction);
    keyboard.current.key = event.key;
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== keyboard.current.key) return;
    event.preventDefault();
    stop();
    // Some hosts still synthesize a zero-detail click in the key-release task.
    keyboard.current.suppressClick = true;
    keyboard.current.clickTimer = setTimeout(() => {
      keyboard.current.suppressClick = false;
      keyboard.current.clickTimer = null;
    }, 0);
  };
  const consumeKeyboardClick = () => {
    if (keyboard.current.key !== null) return true;
    if (!keyboard.current.suppressClick) return false;
    stop();
    return true;
  };
  return { start, stop, onKeyDown, onKeyUp, consumeKeyboardClick };
}

/** Numeric picker channel with a retained text draft and accelerated press-and-hold controls. */
export function PickerNumberField(props: PickerNumberFieldProps) {
  const editing = useNumberEditing(props);
  const hold = useNumberHold(editing.input, editing.changeStep, props.disabled);
  return (
    <div className="sniptale-picker-number">
      {props.prefix ? <span aria-hidden="true">{props.prefix}</span> : null}
      <input
        ref={editing.input}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        aria-invalid={editing.invalid || undefined}
        type="number"
        min={props.cyclic ? undefined : (props.min ?? 0)}
        max={props.cyclic ? undefined : (props.max ?? 100)}
        step={props.step ?? 1}
        value={editing.draft}
        onChange={editing.onChange}
        onBlur={(event) => {
          hold.stop();
          editing.onBlur(event);
        }}
        onKeyDown={editing.onKeyDown}
      />
      {props.unit ? <span aria-hidden="true">{props.unit}</span> : null}
      <span className="sniptale-picker-steppers">
        {[1, -1].map((direction) => (
          <button
            key={direction}
            type="button"
            disabled={props.disabled}
            aria-label={`${props.ariaLabel} ${direction > 0 ? '+' : '−'}`}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              hold.start(direction);
            }}
            onPointerUp={hold.stop}
            onPointerCancel={hold.stop}
            onPointerLeave={hold.stop}
            onLostPointerCapture={hold.stop}
            onBlur={hold.stop}
            onKeyDown={(event) => hold.onKeyDown(event, direction)}
            onKeyUp={hold.onKeyUp}
            onClick={(event) => {
              if (event.detail === 0 && !hold.consumeKeyboardClick()) editing.changeStep(direction);
            }}
          >
            <svg
              aria-hidden="true"
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points={direction > 0 ? '3 7 6 4 9 7' : '3 4 6 7 9 4'} />
            </svg>
          </button>
        ))}
      </span>
    </div>
  );
}
