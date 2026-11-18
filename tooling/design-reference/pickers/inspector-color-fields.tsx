import { Check, Copy } from 'lucide-react';
import { getColorAlpha, normalizeColor, setColorAlpha } from '@sniptale/foundation/color';
import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { InspectorColorPicker } from './inspector-color-picker';
import type { InspectorCopy } from './inspector-copy';
import { ColorAlphaValue } from './inspector-numeric-fields';

function parseHex(text: string) {
  const digits = text.trim().replace(/^#/u, '');
  if (![3, 4, 6, 8].includes(digits.length) || !/^[0-9a-f]+$/iu.test(digits)) return null;
  const color = normalizeColor('#' + digits);
  return color ? { color, hasAlpha: digits.length === 4 || digits.length === 8 } : null;
}

function HexValue({
  value,
  label,
  invalid,
  disabled,
  errorTarget,
  onCommit,
}: {
  value: string;
  label: string;
  invalid: string;
  disabled: boolean;
  errorTarget: RefObject<HTMLDivElement | null>;
  onCommit: (value: NonNullable<ReturnType<typeof parseHex>>) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const errorId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    input?.focus({ preventScroll: true });
    input?.select();
  }, []);

  const close = (restoreFocus: boolean) => {
    finished.current = true;
    setDraft(null);
    setError(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };

  if (draft === null) {
    return (
      <button
        ref={trigger}
        className="inspector-hex-trigger"
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          finished.current = false;
          setDraft(value);
        }}
      >
        {value}
      </button>
    );
  }

  const accept = (restoreFocus: boolean) => {
    if (finished.current) return;
    const parsed = parseHex(draft);
    if (!parsed) {
      setError(true);
      return;
    }
    close(restoreFocus);
    onCommit(parsed);
  };
  return (
    <>
      <div className="inspector-hex-editor">
        <input
          ref={focusInput}
          type="text"
          aria-label={label}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error || undefined}
          value={draft}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(false);
          }}
          onBlur={() => accept(false)}
          onPaste={(event) => {
            const parsed = parseHex(event.clipboardData.getData('text/plain'));
            if (!parsed) return;
            event.preventDefault();
            close(true);
            onCommit(parsed);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.stopPropagation();
              event.preventDefault();
              if (event.key === 'Enter') accept(true);
              else close(true);
            }
          }}
        />
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

function CopyColor({ copy, label, value }: { copy: InspectorCopy; label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle');
  const pending = useRef(false);
  const reset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reset.current), []);

  async function write() {
    if (pending.current) return;
    window.clearTimeout(reset.current);
    pending.current = true;
    setStatus('busy');
    try {
      await writeBrowserClipboardText(value);
      setStatus('copied');
      reset.current = window.setTimeout(() => setStatus('idle'), 1200);
    } catch {
      setStatus('failed');
    } finally {
      pending.current = false;
    }
  }

  const Icon = status === 'copied' ? Check : Copy;
  return (
    <>
      <button
        type="button"
        className="color-copy"
        aria-label={label}
        title={label}
        aria-busy={status === 'busy' || undefined}
        data-copy-state={status}
        onClick={() => void write()}
      >
        <Icon aria-hidden="true" />
      </button>
      <span
        role="status"
        className={status === 'failed' ? 'field-error color-copy-error' : 'sr-only'}
      >
        {status === 'copied' ? copy.copiedHex : status === 'failed' ? copy.copyHexFailed : ''}
      </span>
    </>
  );
}

export function InspectorColorField({
  copy,
  palette,
  initialValue,
  allowAlpha = false,
  onVisibleColorChange,
}: {
  copy: InspectorCopy;
  palette: readonly string[];
  initialValue: string;
  allowAlpha?: boolean;
  onVisibleColorChange?: (value: string) => void;
}) {
  const [color, setColor] = useState(initialValue);
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const errorTarget = useRef<HTMLDivElement>(null);
  const visible = preview ?? color;
  const hex = (setColorAlpha(visible, 1) ?? visible).toUpperCase();
  const label = allowAlpha ? copy.colorWithAlpha : copy.color;
  const copyValue = allowAlpha && color.length === 7 ? color + 'FF' : color;

  const showPreview = (value: string | null) => {
    setPreview(value);
    onVisibleColorChange?.(value ?? color);
  };
  const commit = (value: string) => {
    setColor(value);
    setPreview(null);
    onVisibleColorChange?.(value);
  };

  return (
    <div className="parameter color-row">
      <div className="color-row-name">
        <span className="param-name">{label}</span>
        <CopyColor
          copy={copy}
          label={allowAlpha ? copy.copyAlphaHex : copy.copyHex}
          value={copyValue.toUpperCase()}
        />
      </div>
      <div
        className={allowAlpha ? 'color-field color-alpha-field' : 'color-field solid-color-field'}
        data-open={open}
      >
        <div className="color-frame" ref={frame}>
          <InspectorColorPicker
            anchorRef={frame}
            label={label}
            value={color}
            allowAlpha={allowAlpha}
            palette={palette}
            onOpenChange={setOpen}
            onChange={commit}
            onPreviewChange={showPreview}
            onPreviewReset={() => showPreview(null)}
          />
          <HexValue
            key={open ? 'hex-picker' : 'hex-inline'}
            value={hex}
            disabled={open}
            invalid={copy.invalidHex}
            errorTarget={errorTarget}
            label={allowAlpha ? copy.colorWithAlphaHex : copy.colorHex}
            onCommit={(parsed) => {
              if (allowAlpha && parsed.hasAlpha) {
                commit(parsed.color);
                return;
              }
              const next = setColorAlpha(
                parsed.color,
                allowAlpha ? (getColorAlpha(color) ?? 1) : 1
              );
              if (next) commit(next);
            }}
          />
          {allowAlpha && (
            <ColorAlphaValue
              key={open ? 'alpha-picker' : 'alpha-inline'}
              copy={copy}
              errorTarget={errorTarget}
              disabled={open}
              value={Math.round((getColorAlpha(visible) ?? 1) * 100)}
              onChange={(value) => {
                const next = setColorAlpha(color, value / 100);
                if (next) commit(next);
              }}
            />
          )}
        </div>
        <div ref={errorTarget} />
      </div>
    </div>
  );
}
