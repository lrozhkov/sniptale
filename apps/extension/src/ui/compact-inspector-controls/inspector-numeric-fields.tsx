import { Check, Pencil } from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import './inspector-numeric-fields.css';
import { rangeKeyboardValue, snapRangeProposal } from './numeric-range-scrub';
import {
  clampNumber,
  formatCompactEditNumber,
  parseCompactNumber,
  resolveCompactUnitLabel,
  type CompactInspectorUnit,
} from './shared';

type InspectorNumericCopy = {
  apply: string;
  numericStepHint?: string;
  invalid: (max: number, min: number) => string;
};

type NumericProps = {
  copy: InspectorNumericCopy;
  labelledBy?: string | undefined;
  label?: string | undefined;
  disabled?: boolean;
  fractional?: boolean;
  unit?: CompactInspectorUnit | undefined;
  step?: number | undefined;
  precision?: number | undefined;
  value: number;
  min?: number | undefined;
  max: number;
  onChange: (value: number) => void;
  onPreview?: (value: number) => void;
  onCancel?: (start: number) => void;
};

function useNumericDraft({
  copy,
  value,
  min = 0,
  max,
  onChange,
  disabled,
  fractional,
  unit = '%',
  step = 1,
  precision,
}: NumericProps) {
  const [draft, setDraft] = useState<{ text: string; value?: number; edited: boolean } | null>(
    null
  );
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const editing = draft !== null;
  const text = draft?.text.trim() ?? '';
  const parsed =
    draft?.value ??
    (fractional
      ? parseCompactNumber(text.replace(',', '.'), unit)
      : /^\d+$/u.test(text)
        ? Number(text)
        : null);
  const next = parsed ?? value;
  const initial = formatCompactEditNumber(value, { precision });
  const valid = parsed !== null && next >= min && next <= max;

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);
  useEffect(() => {
    if (editing || disabled || !returnFocus.current) return;
    returnFocus.current = false;
    const button = trigger.current;
    const root = button?.getRootNode();
    const active =
      root instanceof ShadowRoot ? root.activeElement : button?.ownerDocument.activeElement;
    if (!active || active === button?.ownerDocument.body || active === button?.closest('dialog'))
      button?.focus({ preventScroll: true });
  }, [disabled, editing]);

  const close = (restoreFocus: boolean) => {
    setDraft(null);
    setError(false);
    returnFocus.current = restoreFocus;
  };
  const commit = (restoreFocus: boolean) => {
    if (!valid) {
      setError(true);
      return;
    }
    close(restoreFocus);
    if (draft?.edited && next !== value) onChange(next);
  };
  return {
    draft: draft?.text ?? null,
    error,
    min,
    max,
    numericValue: valid ? next : value,
    stepHint: copy.numericStepHint,
    step: (direction: 1 | -1) => {
      const value = clampNumber(Number((next + step * direction).toPrecision(15)), min, max);
      if (!valid || next === value) return false;
      setDraft({ text: formatCompactEditNumber(value, { precision }), value, edited: true });
      setError(false);
      return true;
    },
    input,
    trigger,
    open: () => {
      if (!disabled) setDraft({ text: initial, value, edited: false });
    },
    close,
    commit,
    update: (value: string) => {
      setDraft({ text: value, edited: true });
      setError(false);
    },
  };
}

function NumberEditor({
  editor,
  labelledBy,
  label,
  unit,
  errorId,
  applyLabel,
}: {
  editor: ReturnType<typeof useNumericDraft>;
  labelledBy?: string | undefined;
  label?: string | undefined;
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
    <div
      className="numeric-editor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) editor.commit(false);
      }}
    >
      <div className="number-readout">
        <input
          ref={editor.input}
          aria-labelledby={labelledBy}
          aria-label={label}
          aria-invalid={editor.error || undefined}
          aria-describedby={editor.error ? errorId : hintId}
          type="text"
          role="spinbutton"
          aria-valuemin={editor.min}
          aria-valuemax={editor.max}
          aria-valuenow={editor.numericValue}
          title={editor.stepHint}
          inputMode="decimal"
          autoComplete="off"
          value={editor.draft ?? ''}
          onInput={(event) => editor.update(event.currentTarget.value)}
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
              event.stopPropagation();
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
    <div className="parameter-value sniptale-inspector-numeric">
      <div
        className={'compound-field ' + className}
        data-editing={editing}
        data-invalid={editor.error}
      >
        {editing ? (
          <NumberEditor
            editor={editor}
            labelledBy={props.labelledBy}
            label={props.label}
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
          {props.copy.invalid(props.max, props.min ?? 0)}
        </p>
      )}
    </div>
  );
}

export function OpacityField(
  props: NumericProps & {
    copy: InspectorNumericCopy & { editOpacity: string };
    scrubStep?: number | undefined;
  }
) {
  const unit = resolveCompactUnitLabel(props.unit ?? '%');
  const min = props.min ?? 0;
  const interaction = useRef<{
    start: number;
    kind: 'pointer' | 'key';
    proposal?: number;
  } | null>(null);
  const ignoreInput = useRef(false);
  const [preview, setPreview] = useState<number | null>(null);
  const step = props.scrubStep ?? props.step ?? 1;
  const value = preview ?? props.value;
  const shownValue = formatCompactEditNumber(value, { precision: props.precision });
  const readout = [shownValue, unit].filter(Boolean).join(unit === '%' ? '' : ' ');
  const propose = (next: number) => {
    if (ignoreInput.current) return;
    if (interaction.current && props.onPreview) {
      interaction.current.proposal = next;
      setPreview(next);
      props.onPreview(next);
    } else props.onChange(next);
  };
  const finish = () => {
    const current = interaction.current;
    interaction.current = null;
    setPreview(null);
    if (!current || current.proposal === undefined) return;
    if (current.proposal !== current.start) props.onChange(current.proposal);
    else props.onCancel?.(current.start);
  };
  const cancel = () => {
    const current = interaction.current;
    interaction.current = null;
    setPreview(null);
    if (!current) return;
    // Native range input can continue while a canceled pointer is still held.
    ignoreInput.current = true;
    if (props.onCancel) props.onCancel(current.start);
    else if (props.onPreview) props.onPreview(current.start);
    else props.onChange(current.start);
  };
  return (
    <NumericField props={props} className="opacity-field" unit={unit}>
      {(editor) => (
        <>
          <div
            className="opacity-track"
            style={
              {
                '--progress': clampNumber((value - min) / (props.max - min), 0, 1),
              } as CSSProperties
            }
          >
            <div className="opacity-paint" aria-hidden="true">
              <span className="opacity-fill" />
              <span className="opacity-marker" />
            </div>
            <span className="opacity-value number-readout" aria-hidden="true">
              <span className="readout-digits">{shownValue}</span>
              <span className="field-unit">{unit}</span>
            </span>
            <input
              type="range"
              min={min}
              max={props.max}
              step={props.fractional ? 'any' : step}
              value={value}
              aria-labelledby={props.labelledBy}
              aria-label={props.label}
              aria-valuetext={readout}
              disabled={props.disabled}
              onChange={(event) => {
                propose(snapRangeProposal(event.currentTarget.valueAsNumber, min, props.max, step));
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                ignoreInput.current = false;
                interaction.current = { start: props.value, kind: 'pointer' };
              }}
              onPointerUp={finish}
              onPointerCancel={cancel}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && interaction.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  cancel();
                } else if (/^(Arrow|Page|Home$|End$)/u.test(event.key)) {
                  if (!event.repeat) ignoreInput.current = false;
                  if (ignoreInput.current) {
                    event.preventDefault();
                    return;
                  }
                  if (props.onPreview) {
                    const current = interaction.current?.proposal ?? props.value;
                    const next = rangeKeyboardValue(event, min, props.max, step, current);
                    if (next === null) return;
                    event.preventDefault();
                    interaction.current ??= { start: props.value, kind: 'key' };
                    propose(next);
                  }
                }
              }}
              onKeyUp={() => {
                if (interaction.current?.kind === 'key') finish();
              }}
              onBlur={() => {
                if (interaction.current?.kind === 'key') finish();
                else if (props.onPreview) cancel();
                else interaction.current = null;
              }}
            />
          </div>
          <button
            ref={editor.trigger}
            type="button"
            className="field-action"
            aria-label={props.copy.editOpacity}
            title={props.copy.editOpacity}
            disabled={props.disabled}
            onClick={editor.open}
          >
            <Pencil aria-hidden="true" />
          </button>
        </>
      )}
    </NumericField>
  );
}
