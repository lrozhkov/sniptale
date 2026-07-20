import { translate } from '../../platform/i18n';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

const TEXT_ACTION_CLASS_NAME = [
  'inline-flex h-9 items-center justify-center rounded-[10px] border-none px-3',
  'text-xs font-medium text-[color:var(--sniptale-color-text-secondary)] transition',
  'bg-transparent shadow-none outline-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'hover:text-[color:var(--sniptale-color-text-primary)] active:translate-y-px',
  'active:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'focus-visible:text-[color:var(--sniptale-color-text-primary)] focus-visible:outline-none',
  'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
].join(' ');

const MODE_LABEL_CLASS_NAME =
  'text-[12px] font-semibold uppercase text-[var(--sniptale-color-text-secondary)]';
const MODE_SWITCH_OVERLAY_CLASS_NAME = [
  'absolute inset-0 z-10 rounded-[8px] border-none bg-transparent outline-none transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_56%,transparent)]',
  'active:translate-y-px',
  'active:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_56%,transparent)]',
  'focus-visible:outline-none',
  'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
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
export function PickerInputField(props: {
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  spellCheck?: boolean;
  type?: 'number' | 'text';
  value: number | string;
  ariaLabel: string;
}) {
  return (
    <input
      aria-label={props.ariaLabel}
      type={props.type ?? 'number'}
      min={props.min}
      max={props.max}
      spellCheck={props.spellCheck}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      className={[
        'h-9 w-full rounded-[10px] border px-2 text-sm',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_60%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_80%,transparent)]',
        'text-[color:var(--sniptale-color-text-primary)] caret-[color:var(--sniptale-color-accent)]',
        'outline-none transition placeholder:text-[color:var(--sniptale-color-text-muted)]',
        'focus:border-[color:var(--sniptale-color-border-accent-strong)]',
      ].join(' ')}
    />
  );
}

export function PickerModeLabelRow(props: {
  mode: ColorSelectorFormatMode;
  onCycle: () => void;
  labels: readonly string[];
}) {
  return (
    <div className="relative" data-ui="shared.ui.color-selector.mode-label-row">
      <button
        type="button"
        aria-label={getFormatLabel(props.mode)}
        title={getFormatLabel(props.mode)}
        data-ui="shared.ui.color-selector.mode-cycle"
        onClick={props.onCycle}
        className={MODE_SWITCH_OVERLAY_CLASS_NAME}
      />
      <div className="relative grid min-h-5 grid-cols-3 items-center gap-2 rounded-[8px] px-1 py-0.5">
        {props.labels.map((label) => (
          <span
            key={label}
            className={`${MODE_LABEL_CLASS_NAME} ${props.labels.length === 1 ? 'col-span-3' : ''}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PickerManualColorField(props: {
  mode: ColorSelectorFormatMode;
  onChange: (value: string) => void;
  onCycle: () => void;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <PickerModeLabelRow
        mode={props.mode}
        onCycle={props.onCycle}
        labels={[translate('shared.ui.colorSelectorHex')]}
      />
      <PickerInputField
        ariaLabel={translate('shared.ui.colorSelectorHex')}
        type="text"
        spellCheck={false}
        value={props.value}
        onChange={props.onChange}
      />
    </div>
  );
}

export function PickerFooter(props: { onApply: () => void; onCancel: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={props.onCancel} className={TEXT_ACTION_CLASS_NAME}>
        {translate('shared.ui.colorSelectorCancel')}
      </button>
      <button
        type="button"
        onClick={props.onApply}
        className={`${TEXT_ACTION_CLASS_NAME} text-[var(--sniptale-color-text-primary)]`}
      >
        {translate('shared.ui.colorSelectorApply')}
      </button>
    </div>
  );
}
