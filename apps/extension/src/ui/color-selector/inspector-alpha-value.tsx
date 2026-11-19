import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

type AlphaCopy = {
  alpha: string;
  editAlpha: string;
  numericStepHint?: string;
  invalid: (max: number) => string;
};

type NumericProps = {
  copy: AlphaCopy;
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

  useLayoutEffect(() => {
    if (!editing) return;
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, [editing]);

  const close = (restoreFocus: boolean) => {
    setDraft(null);
    setError(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  const commit = (restoreFocus: boolean) => {
    if (!valid) {
      setError(true);
      return;
    }
    if (next !== value) onChange(next);
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
  value,
  labelledBy,
  unit,
  errorId,
}: {
  editor: ReturnType<typeof useNumericDraft>;
  value: number;
  labelledBy: string;
  unit: string;
  errorId: string;
}) {
  const inputRef = editor.input;
  const editing = editor.draft !== null;
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
    if (!editing) return;
    const input = inputRef.current;
    const surface =
      input?.closest<HTMLElement>(
        '.color-frame, .sniptale-paint-value, [data-ui="shared.ui.color-selector.trigger"]'
      ) ?? input?.closest<HTMLElement>('.alpha-value');
    if (!surface) return;
    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, [editing, inputRef]);

  return (
    <div className="numeric-editor">
      <div className="number-readout">
        <input
          ref={editor.input}
          aria-labelledby={labelledBy}
          aria-hidden={editing ? undefined : true}
          tabIndex={editing ? undefined : -1}
          readOnly={!editing}
          aria-invalid={editor.error || undefined}
          aria-describedby={editor.error ? errorId : hintId}
          type="text"
          role="spinbutton"
          aria-valuemin={0}
          aria-valuemax={editor.max}
          aria-valuenow={editing ? editor.numericValue : value}
          title={editor.stepHint}
          inputMode="numeric"
          autoComplete="off"
          value={editor.draft ?? String(value)}
          onChange={(event) => editor.update(event.target.value)}
          onBlur={(event) => {
            event.currentTarget.setSelectionRange(0, 0);
            if (
              editing &&
              !event.currentTarget.closest('.numeric-editor')?.contains(event.relatedTarget)
            )
              editor.commit(false);
          }}
          onKeyDown={(event) => {
            if (!editing || event.nativeEvent.isComposing) return;
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
    </div>
  );
}

export function ColorAlphaValue({
  copy,
  value,
  disabled,
  errorTarget,
  onChange,
}: {
  copy: AlphaCopy;
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
    <div className="alpha-value sniptale-inspector-numeric">
      <span id={labelId} className="sr-only">
        {label}, %
      </span>
      <NumberEditor editor={editor} value={value} labelledBy={labelId} unit="%" errorId={errorId} />
      {editor.draft === null && (
        <button
          ref={editor.trigger}
          type="button"
          className="number-readout"
          aria-label={label + ', ' + value + '%'}
          title={copy.editAlpha}
          disabled={disabled}
          onClick={editor.open}
        >
          <span className="readout-digits sr-only">{value}</span>
          <span className="field-unit sr-only">%</span>
        </button>
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
