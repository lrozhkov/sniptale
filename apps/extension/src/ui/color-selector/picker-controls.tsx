import type { ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { normalizeColorSelectorValue } from '@sniptale/ui/color-selector/helpers';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { PickerNumberField } from './picker-number-field';

const FORMAT_SWITCH_CLASS = [
  'sniptale-picker-formats grid grid-cols-3 gap-0.5 rounded-[4px]',
  'bg-[var(--sniptale-color-surface-input)] p-0.5',
].join(' ');

const HEX_INPUT_CLASS = [
  'h-8 min-w-0 w-full rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-input)] px-2 text-[13px]',
  'text-[var(--sniptale-color-text-primary)] outline-none focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const DENSITY_ACTION_CLASS = [
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px]',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const CANCEL_ACTION_CLASS = [
  'h-8 cursor-pointer rounded-[4px] px-3 text-xs',
  'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const APPLY_ACTION_CLASS = [
  'h-8 cursor-pointer rounded-[4px] bg-[var(--sniptale-color-surface-hover)] px-3 text-xs',
  'hover:brightness-110 focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const FORMAT_BUTTON_CLASS = [
  'h-7 cursor-pointer rounded-[3px] text-xs focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const ACTIVE_FORMAT_CLASS = [
  'bg-[var(--sniptale-picker-selected)] text-[var(--sniptale-color-text-primary)]',
].join(' ');

const INACTIVE_FORMAT_CLASS = [
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

function getFormatLabel(mode: ColorSelectorFormatMode) {
  switch (mode) {
    case 'hex':
      return translate('shared.ui.colorSelectorHex');
    case 'rgb':
      return translate('shared.ui.colorSelectorRgb');
    case 'hsl':
      return translate('shared.ui.colorSelectorHsl');
  }
}

export function PickerNumericInputField(props: {
  ariaLabel: string;
  max?: number | undefined;
  min?: number | undefined;
  onChange: (value: string) => void;
  unit?: string | undefined;
  prefix?: string | undefined;
  value: number | string;
}) {
  return <PickerNumberField {...props} />;
}

export function PickerModeLabelRow(props: { mode: ColorSelectorFormatMode; onCycle: () => void }) {
  const modes: ColorSelectorFormatMode[] = ['hex', 'rgb', 'hsl'];
  return (
    <div
      className={FORMAT_SWITCH_CLASS}
      data-ui="shared.ui.color-selector.mode-label-row"
      role="group"
      aria-label={getFormatLabel(props.mode)}
    >
      {modes.map((mode, index) => (
        <button
          key={mode}
          type="button"
          aria-label={getFormatLabel(mode)}
          aria-pressed={props.mode === mode}
          data-ui="shared.ui.color-selector.mode-cycle"
          className={[
            FORMAT_BUTTON_CLASS,
            props.mode === mode ? ACTIVE_FORMAT_CLASS : INACTIVE_FORMAT_CLASS,
          ].join(' ')}
          onClick={() => {
            const steps = (index - modes.indexOf(props.mode) + modes.length) % modes.length;
            for (let n = 0; n < steps; n += 1) props.onCycle();
          }}
        >
          {getFormatLabel(mode)}
        </button>
      ))}
    </div>
  );
}

export function PickerManualColorField(props: {
  mode: ColorSelectorFormatMode;
  onChange: (value: string) => void;
  onCycle: () => void;
  value: string;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
}) {
  return (
    <div className="grid gap-2">
      <PickerModeLabelRow mode={props.mode} onCycle={props.onCycle} />
      <input
        aria-label={translate('shared.ui.colorSelectorHex')}
        type="text"
        spellCheck={false}
        value={props.value}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        aria-invalid={
          !normalizeColorSelectorValue(
            props.value.startsWith('#') ? props.value : `#${props.value}`
          ) || undefined
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') props.onBlur?.();
        }}
        onChange={(event) => props.onChange(event.target.value)}
        className={HEX_INPUT_CLASS}
      />
    </div>
  );
}

export function PickerFooter(props: {
  variant?: 'color' | 'paint';
  onApply: () => void;
  onCancel: () => void;
  utilities?: ReactNode;
  compact?: boolean | undefined;
  onToggleCompact?: (() => void) | undefined;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 ${props.variant === 'paint' ? 'pt-2' : 'pt-3'}`}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        {props.onToggleCompact ? (
          <button
            type="button"
            aria-label={translate(
              props.compact
                ? 'shared.ui.colorSelectorFullMode'
                : 'shared.ui.colorSelectorCompactMode'
            )}
            title={translate(
              props.compact
                ? 'shared.ui.colorSelectorFullMode'
                : 'shared.ui.colorSelectorCompactMode'
            )}
            aria-pressed={props.compact}
            onClick={props.onToggleCompact}
            className={DENSITY_ACTION_CLASS}
          >
            {props.compact ? (
              <Maximize2 size={16} strokeWidth={1.75} />
            ) : (
              <Minimize2 size={16} strokeWidth={1.75} />
            )}
          </button>
        ) : null}
        {props.utilities}
      </div>
      <span className="flex-1" />
      <button type="button" onClick={props.onCancel} className={CANCEL_ACTION_CLASS}>
        {translate('shared.ui.colorSelectorCancel')}
      </button>
      <button type="button" onClick={props.onApply} className={APPLY_ACTION_CLASS}>
        {translate('shared.ui.colorSelectorApply')}
      </button>
    </div>
  );
}
