import { Trash2, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PageStyleAssetReference } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../../platform/i18n';
import type { PageStyleInspectorActionOutcome } from '../../types';
import { isPageStyleAssetCleanupError } from '../../action-errors';
import { Field } from '../field-shell';
import { BackgroundAssetPreview } from './background-file-preview';

function formatAssetSize(size: number | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return '';
  }

  if (size < 1024) {
    return `${Math.round(size)} B`;
  }

  return `${Math.round(size / 1024)} KB`;
}

export function BackgroundFileField(props: {
  asset: PageStyleAssetReference | null;
  buttonLabel: string;
  disabled: boolean;
  label: string;
  onClear: () => Promise<PageStyleInspectorActionOutcome>;
  onSelect: (file: File) => Promise<PageStyleInspectorActionOutcome>;
}) {
  const actionState = useBackgroundFileActionState();

  return (
    <Field label={props.label}>
      <div data-ui="content.page-style-inspector.background-file-field" className="grid gap-2">
        <HiddenBackgroundFileInput
          disabled={props.disabled}
          inputId={actionState.inputId}
          inputRef={actionState.inputRef}
          pending={actionState.pending}
          runFileAction={actionState.runFileAction}
          onSelect={props.onSelect}
        />
        <BackgroundAssetSummary asset={props.asset} />
        <BackgroundFileActions
          asset={props.asset}
          buttonLabel={props.buttonLabel}
          disabled={props.disabled}
          inputRef={actionState.inputRef}
          pending={actionState.pending}
          runFileAction={actionState.runFileAction}
          onClear={props.onClear}
        />
        <BackgroundFileStatus error={actionState.error} warning={actionState.warning} />
      </div>
    </Field>
  );
}

function useBackgroundFileActionState() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const runFileAction = async (action: () => Promise<PageStyleInspectorActionOutcome>) => {
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const outcome = await action();
      if (outcome?.state === 'warning') {
        setWarning(outcome.message);
      }
    } catch (error) {
      setError(resolveBackgroundFileErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return { error, inputId, inputRef, pending, runFileAction, warning };
}

function HiddenBackgroundFileInput(props: {
  disabled: boolean;
  inputId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (file: File) => Promise<PageStyleInspectorActionOutcome>;
  pending: boolean;
  runFileAction: (action: () => Promise<PageStyleInspectorActionOutcome>) => Promise<void>;
}) {
  return (
    <input
      ref={props.inputRef}
      id={props.inputId}
      disabled={props.disabled || props.pending}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) {
          void props.runFileAction(() => props.onSelect(file));
        }
        event.currentTarget.value = '';
      }}
    />
  );
}

function BackgroundFileActions(props: {
  asset: PageStyleAssetReference | null;
  buttonLabel: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onClear: () => Promise<PageStyleInspectorActionOutcome>;
  pending: boolean;
  runFileAction: (action: () => Promise<PageStyleInspectorActionOutcome>) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2">
      <BackgroundUploadButton {...props} />
      <BackgroundClearButton {...props} />
    </div>
  );
}

function BackgroundUploadButton(props: {
  buttonLabel: string;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled || props.pending}
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
        ? translate('content.pageStyleInspector.backgroundFileSaving')
        : props.buttonLabel}
    </button>
  );
}

function BackgroundClearButton(props: {
  asset: PageStyleAssetReference | null;
  disabled: boolean;
  onClear: () => Promise<PageStyleInspectorActionOutcome>;
  pending: boolean;
  runFileAction: (action: () => Promise<PageStyleInspectorActionOutcome>) => Promise<void>;
}) {
  return (
    <button
      type="button"
      aria-label={translate('content.pageStyleInspector.backgroundFileClear')}
      title={translate('content.pageStyleInspector.backgroundFileClear')}
      disabled={props.disabled || props.pending || !props.asset}
      className={[
        'inline-flex h-10 w-10 items-center justify-center rounded-[10px] border',
        'border-[color:var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-secondary)]',
        'hover:border-[color:var(--sniptale-color-danger)] hover:text-[var(--sniptale-color-danger)]',
        'disabled:cursor-not-allowed disabled:opacity-35',
      ].join(' ')}
      onClick={() => void props.runFileAction(props.onClear)}
    >
      <Trash2 size={14} />
    </button>
  );
}

function BackgroundFileStatus(props: { error: string | null; warning: string | null }) {
  if (props.error) {
    return (
      <BackgroundFileMessage message={props.error} tone="text-[var(--sniptale-color-danger)]" />
    );
  }

  if (props.warning) {
    return (
      <BackgroundFileMessage message={props.warning} tone="text-[var(--sniptale-color-warning)]" />
    );
  }

  return null;
}

function BackgroundFileMessage(props: { message: string; tone: string }) {
  return <div className={['text-[11px] font-semibold', props.tone].join(' ')}>{props.message}</div>;
}

function resolveBackgroundFileErrorMessage(error: unknown): string {
  return isPageStyleAssetCleanupError(error)
    ? error.message
    : translate('content.pageStyleInspector.backgroundFileError');
}

function BackgroundAssetSummary(props: { asset: PageStyleAssetReference | null }) {
  const size = formatAssetSize(props.asset?.size);

  return (
    <div
      className={[
        'grid min-h-12 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 rounded-[10px] border p-2',
        'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
    >
      <BackgroundAssetPreview asset={props.asset} />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-xs font-bold text-[var(--sniptale-color-text-primary)]">
          {props.asset?.filename ?? translate('content.pageStyleInspector.backgroundFileEmpty')}
        </span>
        <span className="truncate text-[11px] font-semibold text-[var(--sniptale-color-text-dim)]">
          {props.asset
            ? [translate('content.pageStyleInspector.backgroundFileSelected'), size]
                .filter(Boolean)
                .join(' - ')
            : translate('content.pageStyleInspector.backgroundFileEmpty')}
        </span>
      </span>
    </div>
  );
}
