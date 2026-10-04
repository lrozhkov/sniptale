import { useCallback, useEffect, useRef, useState } from 'react';
import { getColorAlpha } from '@sniptale/foundation/color';
import { translate } from '../../platform/i18n';
import {
  COMPACT_INLINE_VALUE_SURFACE_CLASS_NAME,
  COMPACT_INLINE_VALUE_FOCUS_CLASS_NAME,
  COMPACT_INLINE_VALUE_INPUT_CLASS_NAME,
} from '../compact-inspector-controls/interactive-control-style';
import { cx } from '../compact-inspector-controls/shared';
import {
  COLOR_SELECTOR_TRANSPARENT,
  hexToHsl,
  hexToRgb,
  resolvePickerColor,
  normalizeColorSelectorValue,
} from '@sniptale/ui/color-selector/helpers';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

function buildTriggerDisplayValue(value: string, formatMode: ColorSelectorFormatMode) {
  if (value.trim().toLowerCase() === COLOR_SELECTOR_TRANSPARENT) {
    return translate('shared.ui.colorSelectorTransparent');
  }

  const resolvedColor = resolvePickerColor(value);
  if (formatMode === 'rgb') {
    const rgbColor = hexToRgb(resolvedColor);
    return rgbColor
      ? `RGB(${rgbColor.red}, ${rgbColor.green}, ${rgbColor.blue})`
      : resolvedColor.toUpperCase();
  }

  if (formatMode === 'hsl') {
    const hslColor = hexToHsl(resolvedColor);
    return hslColor
      ? `HSL(${hslColor.hue}, ${hslColor.saturation}%, ${hslColor.lightness}%)`
      : resolvedColor.toUpperCase();
  }

  return resolvedColor.toUpperCase();
}

function ColorValue(props: {
  value: string;
  displayValue: string;
  label: string;
  disabled: boolean;
  allowAlpha: boolean;
  allowTransparent: boolean;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [invalid, setInvalid] = useState(false);
  const completed = useRef(false);
  useEffect(() => {
    setEditing(false);
    setInvalid(false);
  }, [props.value, props.disabled]);
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    if (input) {
      input.focus();
      input.select();
    }
  }, []);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const finish = (cancel: boolean, restoreFocus: boolean) => {
    if (completed.current) return;
    const normalized = normalizeColorSelectorValue(draft);
    const valid =
      normalized !== null &&
      (props.allowTransparent || normalized !== COLOR_SELECTOR_TRANSPARENT) &&
      (props.allowAlpha ||
        normalized === COLOR_SELECTOR_TRANSPARENT ||
        getColorAlpha(normalized) === 1);
    if (!cancel && !valid) {
      setInvalid(true);
      return;
    }
    completed.current = true;
    setEditing(false);
    setInvalid(false);
    if (!cancel && normalized && normalized !== props.value) props.onCommit(normalized);
    if (restoreFocus) queueMicrotask(() => buttonRef.current?.focus({ preventScroll: true }));
  };
  if (editing)
    return (
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cx(
            'flex min-w-0 flex-col justify-center',
            COMPACT_INLINE_VALUE_SURFACE_CLASS_NAME,
            COMPACT_INLINE_VALUE_FOCUS_CLASS_NAME
          )}
        >
          <input
            ref={focusInput}
            aria-label={props.label}
            aria-invalid={invalid || undefined}
            title={invalid ? translate('shared.ui.colorSelectorInvalid') : props.label}
            disabled={props.disabled}
            spellCheck={false}
            className={cx(COMPACT_INLINE_VALUE_INPUT_CLASS_NAME, 'w-full min-h-0')}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            onBlur={() => finish(false, false)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                finish(event.key === 'Escape', true);
              }
            }}
          />
          {invalid ? (
            <span
              role="alert"
              className="block w-full shrink-0 truncate text-right text-[10px] leading-3"
            >
              {translate('shared.ui.colorSelectorInvalid')}
            </span>
          ) : null}
        </span>
      </span>
    );
  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={props.disabled}
      aria-label={props.label}
      title={props.displayValue}
      data-ui="shared.ui.color-selector.value-trigger"
      className={[
        COMPACT_INLINE_VALUE_SURFACE_CLASS_NAME,
        COMPACT_INLINE_VALUE_FOCUS_CLASS_NAME,
        'min-w-0 flex-1 truncate text-right text-[length:var(--sniptale-compact-font-size,12px)] font-semibold',
        'focus-visible:outline focus-visible:outline-1',
      ].join(' ')}
      onClick={() => {
        completed.current = false;
        setDraft(props.value);
        setEditing(true);
      }}
    >
      {props.displayValue}
    </button>
  );
}

export function ColorSelectorTrigger(props: {
  active?: boolean;
  variant?: 'value' | 'swatch';
  disabled?: boolean;
  formatMode: ColorSelectorFormatMode;
  label: string;
  value: string;
  allowAlpha?: boolean;
  allowTransparent?: boolean;
  onCommit: (value: string) => void;
  onOpenPicker: () => void;
}) {
  const displayValue = buildTriggerDisplayValue(props.value, props.formatMode);
  const swatchColor =
    props.value === COLOR_SELECTOR_TRANSPARENT ? 'transparent' : resolvePickerColor(props.value);
  return (
    <div
      className={cx(
        'relative flex w-full min-w-0 max-w-full items-center gap-1 text-[var(--sniptale-color-text-primary)]',
        props.disabled && 'cursor-not-allowed opacity-55'
      )}
      aria-disabled={props.disabled || undefined}
      data-ui="shared.ui.color-selector.trigger"
      data-variant={props.variant ?? 'value'}
    >
      <button
        type="button"
        disabled={props.disabled}
        aria-label={translate('shared.ui.colorSelectorChooseColor')}
        title={displayValue}
        onClick={props.onOpenPicker}
        className={[
          'inline-flex h-[var(--sniptale-compact-control-height,32px)] w-6 shrink-0',
          'items-center justify-center rounded-[7px] bg-transparent',
          'focus-visible:outline focus-visible:outline-1',
        ].join(' ')}
        data-ui="shared.ui.color-selector.picker-trigger"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-[6px] border border-[var(--sniptale-color-border-soft)]"
          style={{
            backgroundColor: '#fff',
            backgroundImage: [
              `linear-gradient(${swatchColor}, ${swatchColor})`,
              'conic-gradient(#d1d5db 25%, #fff 0 50%, #d1d5db 0 75%, #fff 0)',
            ].join(', '),
            backgroundSize: '100% 100%, 8px 8px',
          }}
        />
      </button>
      <ColorValue
        key={String(props.active === true)}
        value={props.value}
        displayValue={displayValue}
        label={props.label}
        disabled={props.disabled === true || props.active === true}
        allowAlpha={props.allowAlpha !== false}
        allowTransparent={props.allowTransparent !== false}
        onCommit={props.onCommit}
      />
    </div>
  );
}
