import { useId, useRef, useState, type RefObject } from 'react';
import { Upload } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { Field } from './fields';
import type { PageStyleInspectorActionOutcome } from '../types';
import { isPageStyleAssetCleanupError } from '../action-errors';

export function FileField(props: {
  buttonLabel: string;
  disabled: boolean;
  label: string;
  onSelect: (file: File) => Promise<PageStyleInspectorActionOutcome>;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const actionState = useFileFieldActionState(props.onSelect);

  return (
    <Field label={props.label}>
      <HiddenFileInput
        disabled={props.disabled || actionState.pending}
        inputId={inputId}
        inputRef={inputRef}
        onSelect={actionState.handleFileSelect}
      />
      <FileSelectButton
        buttonLabel={props.buttonLabel}
        disabled={props.disabled || actionState.pending}
        inputRef={inputRef}
        pending={actionState.pending}
      />
      <FileFieldStatus error={actionState.error} warning={actionState.warning} />
    </Field>
  );
}

function useFileFieldActionState(
  onSelect: (file: File) => Promise<PageStyleInspectorActionOutcome>
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | false>(false);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleFileSelect(file: File): Promise<void> {
    setPending(true);
    setError(false);
    setWarning(null);
    try {
      const outcome = await onSelect(file);
      if (outcome?.state === 'warning') {
        setWarning(outcome.message);
      }
    } catch (error) {
      setError(resolveFileFieldErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return { error, handleFileSelect, pending, warning };
}

function HiddenFileInput(props: {
  disabled: boolean;
  inputId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (file: File) => Promise<void>;
}) {
  return (
    <input
      ref={props.inputRef}
      id={props.inputId}
      disabled={props.disabled}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) {
          void props.onSelect(file);
        }
        event.currentTarget.value = '';
      }}
    />
  );
}

function FileSelectButton(props: {
  buttonLabel: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={[
        'inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border px-3',
        'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
        'text-xs font-bold text-[var(--sniptale-color-text-primary)] transition',
        'hover:border-[color:var(--sniptale-color-accent)] hover:text-[var(--sniptale-color-accent)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
      ].join(' ')}
      onClick={() => props.inputRef.current?.click()}
    >
      <Upload size={14} />
      {props.pending
        ? translate('content.pageStyleInspector.fileActionPending')
        : props.buttonLabel}
    </button>
  );
}

function FileFieldStatus(props: { error: string | false; warning: string | null }) {
  if (props.error !== false) {
    return <FileFieldMessage tone="text-[var(--sniptale-color-danger)]" message={props.error} />;
  }

  if (props.warning) {
    return <FileFieldMessage tone="text-[var(--sniptale-color-warning)]" message={props.warning} />;
  }

  return null;
}

function resolveFileFieldErrorMessage(error: unknown): string {
  return isPageStyleAssetCleanupError(error)
    ? error.message
    : translate('content.pageStyleInspector.fileActionError');
}

function FileFieldMessage(props: { message: string; tone: string }) {
  return (
    <div className={['mt-2 text-[11px] font-semibold', props.tone].join(' ')}>{props.message}</div>
  );
}
