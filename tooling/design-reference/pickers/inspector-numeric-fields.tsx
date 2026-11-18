import { Check, Minus, Pencil, Plus } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useStepperRepeat } from '@sniptale/ui/compact-inspector-controls/stepper-repeat';

import type { InspectorCopy } from './inspector-copy';

type NumericProps = {
  copy: InspectorCopy;
  labelledBy: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
};

function useNumericDraft({ copy, value, max, onChange }: NumericProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  const text = draft?.trim() ?? '';
  const next = Number(text);
  const valid = /^\d+$/.test(text) && Number.isSafeInteger(next) && next <= max;

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const close = (restoreFocus: boolean) => {
    setDraft(null);
    setError(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  };
  const commit = (restoreFocus: boolean) => {
    if (!valid) {
      setError(true);
      return;
    }
    onChange(next);
    close(restoreFocus);
  };
  return {
    draft,
    error,
    max,
    numericValue: valid ? next : value,
    stepHint: copy.numericStepHint,
    step: (direction: 1 | -1) => {
      const adjusted = next + direction;
      if (!valid || adjusted < 0 || adjusted > max) return false;
      setDraft(String(adjusted));
      setError(false);
      return true;
    },
    input,
    trigger,
    open: () => setDraft(String(value)),
    close,
    commit,
    update: (value: string) => {
      setDraft(value);
      setError(false);
    },
  };
}

function NumberEditor({
  editor,
  labelledBy,
  unit,
  errorId,
  applyLabel,
}: {
  editor: ReturnType<typeof useNumericDraft>;
  labelledBy: string;
  unit: string;
  errorId: string;
  applyLabel?: string;
}) {
  const inputRef = editor.input;
  const hintId = useId();
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (
      !inputRef.current?.matches(':focus') ||
      event.defaultPrevented ||
      !event.cancelable ||
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    )
      return;
    if (editor.step(event.deltaY < 0 ? 1 : -1)) event.preventDefault();
  });
  useEffect(() => {
    const surface = inputRef.current?.closest<HTMLElement>('.compound-field, .color-frame');
    if (!surface) return;
    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, [inputRef]);

  return (
    <div className="numeric-editor">
      <div className="number-readout">
        <input
          ref={editor.input}
          aria-labelledby={labelledBy}
          aria-invalid={editor.error || undefined}
          aria-describedby={editor.error ? errorId : hintId}
          type="text"
          role="spinbutton"
          aria-valuemin={0}
          aria-valuemax={editor.max}
          aria-valuenow={editor.numericValue}
          title={editor.stepHint}
          inputMode="numeric"
          autoComplete="off"
          value={editor.draft ?? ''}
          onChange={(event) => editor.update(event.target.value)}
          onBlur={(event) => {
            if (!event.currentTarget.closest('.numeric-editor')?.contains(event.relatedTarget))
              editor.commit(false);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey
            ) {
              event.preventDefault();
              editor.step(event.key === 'ArrowUp' ? 1 : -1);
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              editor.commit(true);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              editor.close(true);
            }
          }}
        />
        <span id={hintId} hidden>
          {editor.stepHint}
        </span>
        <span className="field-unit" aria-hidden="true">
          {unit}
        </span>
      </div>
      {applyLabel && (
        <button
          type="button"
          className="field-action"
          aria-label={applyLabel}
          onClick={() => editor.commit(true)}
        >
          <Check aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function NumericField({
  props,
  unit,
  className,
  children,
}: {
  props: NumericProps;
  unit: string;
  className: string;
  children: (editor: ReturnType<typeof useNumericDraft>) => ReactNode;
}) {
  const editor = useNumericDraft(props);
  const errorId = useId();
  const editing = editor.draft !== null;
  return (
    <div className="parameter-value">
      <div
        className={'compound-field ' + className}
        data-editing={editing}
        data-invalid={editor.error}
      >
        {editing ? (
          <NumberEditor
            editor={editor}
            labelledBy={props.labelledBy}
            unit={unit}
            errorId={errorId}
            applyLabel={props.copy.apply}
          />
        ) : (
          children(editor)
        )}
      </div>
      {editor.error && (
        <p id={errorId} className="field-error" role="alert">
          {props.copy.invalid(props.max)}
        </p>
      )}
    </div>
  );
}

export function OpacityField(props: NumericProps) {
  const dragStart = useRef<number | null>(null);
  const readout = props.value + '%';
  return (
    <NumericField props={props} className="opacity-field" unit="%">
      {(editor) => (
        <>
          <div
            className="opacity-track"
            style={{ '--progress': props.value / props.max } as CSSProperties}
          >
            <div className="opacity-paint" aria-hidden="true">
              <span className="opacity-fill" />
              <span className="opacity-marker" />
            </div>
            <span className="opacity-value number-readout" aria-hidden="true">
              <span className="readout-digits">{props.value}</span>
              <span className="field-unit">%</span>
            </span>
            <input
              type="range"
              min={0}
              max={props.max}
              step={1}
              value={props.value}
              aria-labelledby={props.labelledBy}
              aria-valuetext={readout}
              onChange={(event) => props.onChange(event.currentTarget.valueAsNumber)}
              onPointerDown={() => {
                dragStart.current = props.value;
              }}
              onPointerUp={() => {
                dragStart.current = null;
              }}
              onPointerCancel={() => {
                if (dragStart.current !== null) props.onChange(dragStart.current);
                dragStart.current = null;
              }}
              onBlur={() => {
                dragStart.current = null;
              }}
            />
          </div>
          <button
            ref={editor.trigger}
            type="button"
            className="field-action"
            aria-label={props.copy.editOpacity}
            title={props.copy.editOpacity}
            onClick={editor.open}
          >
            <Pencil aria-hidden="true" />
          </button>
        </>
      )}
    </NumericField>
  );
}

export function RadiusField(props: NumericProps) {
  const latest = useRef(props.value);
  latest.current = props.value;
  const step = (direction: 1 | -1) => {
    const next = Math.min(props.max, Math.max(0, latest.current + direction));
    if (next === latest.current) {
      repeat.stop();
      return;
    }
    latest.current = next;
    props.onChange(next);
  };
  const repeat = useStepperRepeat(step);

  const stepButton = (direction: -1 | 1) => {
    const Icon = direction < 0 ? Minus : Plus;
    const label = direction < 0 ? props.copy.decreaseRadius : props.copy.increaseRadius;
    const atLimit = direction < 0 ? props.value === 0 : props.value === props.max;
    return (
      <button
        type="button"
        className="field-action"
        aria-label={label}
        title={label}
        aria-disabled={atLimit || undefined}
        onPointerDown={(event) => {
          if (atLimit || event.button !== 0) return;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          repeat.start(direction);
        }}
        onLostPointerCapture={repeat.stop}
        onPointerUp={repeat.stop}
        onPointerCancel={repeat.stop}
        onBlur={repeat.stop}
        onClick={(event) => {
          if (event.detail === 0 && !atLimit) step(direction);
        }}
      >
        <Icon aria-hidden="true" />
      </button>
    );
  };

  return (
    <NumericField props={props} className="radius-field" unit="px">
      {(editor) => (
        <>
          {stepButton(-1)}
          <button
            ref={editor.trigger}
            type="button"
            className="radius-value number-readout"
            aria-label={`${props.copy.editRadius}, ${props.value} px`}
            onClick={editor.open}
          >
            <span className="readout-digits">{props.value}</span>
            <span className="field-unit">px</span>
          </button>
          {stepButton(1)}
        </>
      )}
    </NumericField>
  );
}

export function ColorAlphaValue({
  copy,
  value,
  disabled,
  errorTarget,
  onChange,
}: {
  copy: InspectorCopy;
  value: number;
  disabled: boolean;
  errorTarget: RefObject<HTMLDivElement | null>;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  const errorId = useId();
  const editor = useNumericDraft({ copy, labelledBy: labelId, value, max: 100, onChange });
  const label = copy.alpha;

  return (
    <div className="alpha-value">
      <span id={labelId} className="sr-only">
        {label}, %
      </span>
      {editor.draft === null ? (
        <button
          ref={editor.trigger}
          type="button"
          className="number-readout"
          aria-label={label + ', ' + value + '%'}
          title={copy.editAlpha}
          disabled={disabled}
          onClick={editor.open}
        >
          <span className="readout-digits">{value}</span>
          <span className="field-unit">%</span>
        </button>
      ) : (
        <NumberEditor editor={editor} labelledBy={labelId} unit="%" errorId={errorId} />
      )}
      {editor.error &&
        errorTarget.current &&
        createPortal(
          <p id={errorId} className="field-error" role="alert">
            {copy.invalid(100)}
          </p>,
          errorTarget.current
        )}
    </div>
  );
}
