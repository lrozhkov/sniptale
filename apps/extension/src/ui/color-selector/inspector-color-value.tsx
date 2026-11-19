import { Check, Copy } from 'lucide-react';
import { normalizeColor } from '@sniptale/foundation/color';
import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import './inspector-color-value.css';

function parseColorValue(text: string, transparentLabel: string | undefined) {
  const value = text.trim();
  if (transparentLabel && (value === transparentLabel || value.toLowerCase() === 'transparent')) {
    return { color: 'transparent', hasAlpha: false };
  }
  const digits = value.replace(/^#/u, '');
  if (![3, 4, 6, 8].includes(digits.length) || !/^[0-9a-f]+$/iu.test(digits)) return null;
  const color = normalizeColor('#' + digits);
  return color ? { color, hasAlpha: digits.length === 4 || digits.length === 8 } : null;
}

export function HexValue({
  value,
  transparentLabel,
  label,
  invalid,
  disabled,
  errorTarget,
  onCommit,
}: {
  value: string;
  transparentLabel?: string | undefined;
  label: string;
  invalid: string;
  disabled: boolean;
  errorTarget: RefObject<HTMLDivElement | null>;
  onCommit: (value: NonNullable<ReturnType<typeof parseColorValue>>) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const errorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  const finished = useRef(false);
  const restore = useRef(false);
  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    } else if (restore.current) {
      restore.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const close = (restoreFocus: boolean) => {
    finished.current = true;
    restore.current = restoreFocus;
    setDraft(null);
    setError(false);
  };

  const accept = (restoreFocus: boolean) => {
    if (draft === null || finished.current) return;
    const parsed = parseColorValue(draft, transparentLabel);
    if (!parsed) {
      setError(true);
      return;
    }
    close(restoreFocus);
    onCommit(parsed);
  };
  return (
    <>
      <div
        className="inspector-hex-editor"
        data-ui={editing ? 'shared.ui.color-selector.value-editor' : undefined}
      >
        <input
          ref={input}
          type="text"
          aria-label={label}
          aria-hidden={editing ? undefined : true}
          tabIndex={editing ? undefined : -1}
          readOnly={!editing}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error || undefined}
          value={draft ?? value}
          spellCheck={false}
          style={{ fontFamily: 'inherit' }}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(false);
          }}
          onBlur={(event) => {
            event.currentTarget.setSelectionRange(0, 0);
            accept(false);
          }}
          onPaste={(event) => {
            if (!editing) return;
            const parsed = parseColorValue(
              event.clipboardData.getData('text/plain'),
              transparentLabel
            );
            if (!parsed) return;
            event.preventDefault();
            close(true);
            onCommit(parsed);
          }}
          onKeyDown={(event) => {
            if (!editing || event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.stopPropagation();
              event.preventDefault();
              if (event.key === 'Enter') accept(true);
              else close(true);
            }
          }}
        />
        {!editing && (
          <button
            ref={trigger}
            className="inspector-hex-trigger"
            data-ui="shared.ui.color-selector.value-trigger"
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={() => {
              finished.current = false;
              setDraft(value);
            }}
          >
            <span className="sr-only">{value}</span>
          </button>
        )}
      </div>
      {error &&
        errorTarget.current &&
        createPortal(
          <p id={errorId} role="alert" className="field-error">
            {invalid}
          </p>,
          errorTarget.current
        )}
    </>
  );
}

export const ColorCopyActivation = createContext((event: Event) => event.isTrusted === true);

export function CopyColor({
  copy,
  label,
  value,
  disabled,
  className = 'color-copy',
}: {
  copy: { copiedHex: string; copyHexFailed: string };
  label: string;
  value: string;
  disabled?: boolean;
  className?: string;
}) {
  const authorize = useContext(ColorCopyActivation);
  const [status, setStatus] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle');
  const pending = useRef(false);
  const reset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reset.current), []);

  async function write(event: MouseEvent<HTMLButtonElement>) {
    if (pending.current || disabled || !authorize(event.nativeEvent)) return;
    const { ownerDocument } = event.currentTarget;
    window.clearTimeout(reset.current);
    pending.current = true;
    setStatus('busy');
    const copied = await writeBrowserClipboardText(value).then(
      () => true,
      () => copyFromClick(ownerDocument, value)
    );
    pending.current = false;
    if (!copied) {
      setStatus('failed');
      return;
    }
    setStatus('copied');
    reset.current = window.setTimeout(() => setStatus('idle'), 1200);
  }

  const Icon = status === 'copied' ? Check : Copy;
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-busy={status === 'busy' || undefined}
        data-copy-state={status}
        onClick={(event) => void write(event)}
      >
        <Icon aria-hidden="true" />
      </button>
      <span role="status" className="sr-only">
        {status === 'copied' ? copy.copiedHex : status === 'failed' ? copy.copyHexFailed : ''}
      </span>
    </>
  );
}

function copyFromClick(document: Document, value: string) {
  if (!document.hasFocus() || typeof document.execCommand !== 'function') return false;
  let written = false;
  const supplyText = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', value);
    event.preventDefault();
    written = true;
  };
  document.addEventListener('copy', supplyText, { once: true });
  try {
    return document.execCommand('copy') && written;
  } catch {
    return false;
  } finally {
    document.removeEventListener('copy', supplyText);
  }
}
