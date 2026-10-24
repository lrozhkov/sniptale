import { formatHexColor, parseColor } from '@sniptale/foundation/color';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';

const COMPARISON_ROW_CLASS = [
  'flex items-center justify-between gap-2 text-xs leading-[18px]',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

const ORIGINAL_SWATCH_CLASS = [
  'sniptale-picker-checker h-8 w-8 shrink-0 cursor-pointer rounded-[4px] p-0 hover:outline-1',
  'hover:outline-offset-2 hover:outline-[var(--sniptale-color-text-secondary)]',
  'focus-visible:outline-1 focus-visible:outline-offset-2',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const COPY_ACTION_CLASS = [
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px]',
  'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const COPY_FALLBACK_CLASS = [
  'mt-1 h-8 w-full rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-input)] px-2',
].join(' ');

/** Original swatch restores the session value without committing or closing the editor. */
export function PickerComparison(props: {
  originalColor: string;
  color: string;
  onColorChange: (color: string) => void;
}) {
  const parsedColor = parseColor(props.color);
  const hex = parsedColor ? formatHexColor(parsedColor) : props.color;
  const copyValue = (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}ff` : hex).toUpperCase();
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle');
  const pending = useRef(false);
  const currentColor = useRef(props.color);
  currentColor.current = props.color;
  useEffect(() => setCopyState('idle'), [props.color]);
  const copy = async () => {
    if (pending.current) return;
    const copiedColor = props.color;
    pending.current = true;
    setCopyState('busy');
    try {
      await navigator.clipboard.writeText(copyValue);
      if (currentColor.current === copiedColor) setCopyState('copied');
    } catch {
      if (currentColor.current === copiedColor) setCopyState('failed');
    } finally {
      pending.current = false;
    }
  };
  return (
    <div className="sniptale-picker-comparison">
      <div className={COMPARISON_ROW_CLASS}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label={translate('shared.ui.colorSelectorOriginal')}
            title={translate('shared.ui.colorSelectorOriginal')}
            onClick={() => props.onColorChange(props.originalColor)}
            className={ORIGINAL_SWATCH_CLASS}
          >
            <span
              className="block h-full w-full rounded-[inherit]"
              style={{ backgroundColor: props.originalColor }}
            />
          </button>
          <span>{translate('shared.ui.colorSelectorOriginal')}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="sniptale-picker-checker block h-8 w-8 shrink-0 rounded-[4px]"
            aria-label={translate('shared.ui.colorSelectorCurrent')}
          >
            <span
              className="block h-full w-full rounded-[inherit]"
              style={{ backgroundColor: props.color }}
            />
          </span>
          <span>{translate('shared.ui.colorSelectorCurrent')}</span>
        </div>
        <button
          type="button"
          aria-busy={copyState === 'busy'}
          aria-label={translate('shared.ui.colorSelectorCopy')}
          title={translate('shared.ui.colorSelectorCopy')}
          onClick={() => void copy()}
          className={COPY_ACTION_CLASS}
        >
          {copyState === 'copied' ? (
            <Check size={16} strokeWidth={1.75} />
          ) : (
            <Copy size={16} strokeWidth={1.75} />
          )}
        </button>
      </div>
      <span className="sr-only" role="status">
        {copyState === 'copied' ? translate('shared.ui.colorSelectorCopied') : ''}
      </span>
      {copyState === 'failed' ? (
        <div className="pt-2 text-xs">
          <p role="status">{translate('shared.ui.colorSelectorCopyFailed')}</p>
          <input
            aria-label={translate('shared.ui.colorSelectorCopy')}
            readOnly
            value={copyValue}
            onFocus={(event) => event.currentTarget.select()}
            className={COPY_FALLBACK_CLASS}
          />
        </div>
      ) : null}
    </div>
  );
}
