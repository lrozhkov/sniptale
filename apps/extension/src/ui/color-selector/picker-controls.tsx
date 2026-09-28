import { ChevronsUpDown } from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';
import { NumericValueField } from '../compact-inspector-controls/numeric';
import { CompactInput } from '../compact-inspector-controls/primitives';

const TEXT_ACTION_CLASS_NAME = [
  'inline-flex h-7 cursor-pointer items-center justify-center rounded-[var(--sniptale-radius-sm)] border-none px-3',
  'text-xs font-medium text-[color:var(--sniptale-color-text-secondary)] transition',
  'bg-transparent shadow-none outline-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'hover:text-[color:var(--sniptale-color-text-primary)] active:translate-y-px',
  'active:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_88%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'focus-visible:text-[color:var(--sniptale-color-text-primary)] focus-visible:outline-none',
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
function PickerInputField(props: {
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  spellCheck?: boolean;
  type?: 'number' | 'text';
  value: number | string;
  ariaLabel: string;
}) {
  return (
    <CompactInput
      aria-label={props.ariaLabel}
      type={props.type ?? 'number'}
      min={props.min}
      max={props.max}
      spellCheck={props.spellCheck}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      className="h-7! rounded-[var(--sniptale-radius-sm)]! px-2! text-xs!"
    />
  );
}

export function PickerNumericInputField(props: {
  ariaLabel: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  unit?: '' | '%';
  value: number | string;
}) {
  const numericValue = Number(props.value);
  return (
    <NumericValueField
      className={[
        'h-7! w-full min-w-0 rounded-[var(--sniptale-radius-sm)]! px-1!',
        'border-[color:var(--sniptale-color-border-soft)] bg-transparent',
        '[&>span:last-child]:opacity-100 [&>span:last-child>button]:w-4',
      ].join(' ')}
      label={props.ariaLabel}
      max={props.max}
      min={props.min}
      unit={props.unit ?? ''}
      value={Number.isFinite(numericValue) ? numericValue : null}
      onPreviewValue={(value) => props.onChange(String(value))}
      onCommitValue={(value) => props.onChange(String(value))}
    />
  );
}

export function PickerModeLabelRow(props: { mode: ColorSelectorFormatMode; onCycle: () => void }) {
  return (
    <div data-ui="shared.ui.color-selector.mode-label-row">
      <button
        type="button"
        aria-label={getFormatLabel(props.mode)}
        title={getFormatLabel(props.mode)}
        data-ui="shared.ui.color-selector.mode-cycle"
        onClick={props.onCycle}
        className={`${TEXT_ACTION_CLASS_NAME} gap-0.5 px-1!`}
      >
        <span className="text-[12px] font-semibold uppercase">{getFormatLabel(props.mode)}</span>
        <ChevronsUpDown aria-hidden="true" size={12} />
      </button>
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
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-1">
      <PickerModeLabelRow mode={props.mode} onCycle={props.onCycle} />
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
    <div className="grid grid-cols-2 gap-2 py-1">
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
