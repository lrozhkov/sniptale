import { ChevronDown } from 'lucide-react';
import { translate } from '../../platform/i18n';
import {
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME,
  resolveCompactInspectorInteractiveControlStyle,
} from '../compact-inspector-controls/interactive-control-style';
import { cx } from '../compact-inspector-controls/shared';
import {
  COLOR_SELECTOR_TRANSPARENT,
  hexToHsl,
  hexToRgb,
  resolvePickerColor,
} from '@sniptale/ui/color-selector/helpers';
import type { ColorSelectorFormatMode } from '@sniptale/ui/color-selector/types';

const ROOT_CLASS_NAME = cx(
  'relative flex w-full items-center gap-2 overflow-hidden px-2',
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME,
  COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME
);

const PICKER_ACTION_CLASS_NAME = [
  'inline-flex h-full min-w-0 flex-1 items-center justify-end gap-2 rounded-[7px]',
  'bg-transparent px-0 transition',
  'focus-visible:outline-none focus-visible:ring-0',
  'text-[var(--sniptale-color-text-primary)] hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

const PALETTE_BUTTON_CLASS_NAME = [
  'inline-flex h-full w-5 shrink-0 items-center justify-center rounded-[7px] bg-transparent',
  'focus-visible:outline-none focus-visible:ring-0',
].join(' ');

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

function PickerTriggerButton(props: {
  formatMode: ColorSelectorFormatMode;
  value: string;
  onOpenPicker: () => void;
}) {
  const isTransparent = props.value.trim().toLowerCase() === COLOR_SELECTOR_TRANSPARENT;
  const previewColor = resolvePickerColor(props.value);
  const displayValue = buildTriggerDisplayValue(props.value, props.formatMode);
  const valueClassName = isTransparent
    ? 'truncate text-[12px] font-semibold italic text-[var(--sniptale-color-text-primary)]'
    : [
        'truncate text-[12px] font-semibold text-[var(--sniptale-color-text-primary)]',
        props.formatMode === 'hex' ? 'uppercase' : '',
      ].join(' ');

  return (
    <button
      type="button"
      aria-label={translate('shared.ui.colorSelectorChooseColor')}
      onClick={props.onOpenPicker}
      className={PICKER_ACTION_CLASS_NAME}
      data-ui="shared.ui.color-selector.picker-trigger"
    >
      <span
        aria-hidden="true"
        className={[
          'inline-flex h-4 w-4 shrink-0 rounded-[6px] border',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_90%,transparent)]',
          'bg-[color:var(--sniptale-color-surface-panel)]',
          'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-surface-panel)_52%,transparent)]',
        ].join(' ')}
        style={{ backgroundColor: isTransparent ? 'transparent' : previewColor }}
      />
      <span className={valueClassName}>{displayValue}</span>
    </button>
  );
}

function PaletteButton(props: { expanded: boolean; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.title}
      aria-expanded={props.expanded}
      onClick={props.onClick}
      className={PALETTE_BUTTON_CLASS_NAME}
      data-ui="shared.ui.color-selector.palette-trigger"
    >
      <ChevronDown
        size={15}
        strokeWidth={2.2}
        className={[
          'shrink-0 text-[var(--sniptale-color-text-muted-strong)] opacity-75 transition-transform',
          props.expanded ? 'rotate-180' : '',
        ].join(' ')}
      />
    </button>
  );
}

export function ColorSelectorTrigger(props: {
  active?: boolean;
  expanded: boolean;
  formatMode: ColorSelectorFormatMode;
  label: string;
  title: string;
  value: string;
  onOpenPicker: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <div
      className={cx(
        ROOT_CLASS_NAME,
        props.active && COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME
      )}
      data-ui="shared.ui.color-selector.trigger"
      style={resolveCompactInspectorInteractiveControlStyle(undefined)}
    >
      <PickerTriggerButton
        formatMode={props.formatMode}
        value={props.value}
        onOpenPicker={props.onOpenPicker}
      />
      <PaletteButton
        expanded={props.expanded}
        title={props.title}
        onClick={props.onToggleExpanded}
      />
    </div>
  );
}
