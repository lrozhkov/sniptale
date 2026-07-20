import { ChevronDown, DropletOff, Pipette } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { COMPACT_INSPECTOR_CONTROL_CLASS_NAME } from '../../../ui/compact-inspector-controls';
import { TRANSPARENT_COLOR } from '../../document/model';
import { normalizeHexColor, resolvePreviewColor } from './helpers';
import { buildColorOptions, ColorSection } from './shared';
import { cx } from '../ui/primitives';
import { COLOR_CONTROL_DISABLED_HOVER_CLASS_NAME } from './parts.constants';

const EDITOR_CONTROL_BORDER_CLASS_NAME =
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_52%,transparent)]';
const TRANSPARENT_SWATCH_CLASS_NAME = [
  'bg-[linear-gradient(135deg,#0000_42%,',
  'var(--sniptale-color-border-strong)_42%,',
  'var(--sniptale-color-border-strong)_58%,#0000_58%)]',
].join('');
const COLOR_CONTROL_TRIGGER_CLASS_NAME = [
  COMPACT_INSPECTOR_CONTROL_CLASS_NAME,
  'flex h-10 w-full items-center gap-3 px-3 text-left transition',
  'hover:bg-[color:var(--sniptale-color-surface-hover)]',
].join(' ');
const COLOR_CONTROL_PANEL_CLASS_NAME = [
  'space-y-3 rounded-[14px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_48%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)] p-3.5',
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-border-subtle)_16%,transparent)]',
].join('');

const COLOR_CONTROL_SECONDARY_ACTION_CLASS_NAME = [
  'inline-flex h-10 items-center justify-center rounded-[var(--sniptale-radius-lg)] border',
  EDITOR_CONTROL_BORDER_CLASS_NAME,
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_76%,var(--sniptale-color-surface-panel)_24%)]',
  'transition hover:bg-[color:var(--sniptale-color-surface-hover)]',
].join(' ');
const COLOR_CONTROL_APPLY_ACTION_CLASS_NAME = [
  'inline-flex h-10 items-center justify-center rounded-[var(--sniptale-radius-lg)] border',
  EDITOR_CONTROL_BORDER_CLASS_NAME,
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,var(--sniptale-color-surface-input)_86%)]',
  'px-2 text-xs font-semibold text-[var(--sniptale-color-text-primary)] transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_20%,var(--sniptale-color-surface-hover)_80%)]',
  'disabled:cursor-not-allowed disabled:opacity-45',
  COLOR_CONTROL_DISABLED_HOVER_CLASS_NAME,
].join(' ');

type ColorControlActionRowProps = {
  applyDisabled: boolean;
  draftColor: string;
  onApplyDraft: () => void;
  onDraftChange: (value: string) => void;
  onSelectNone: () => void;
};

function TransparentColorButton(props: { onSelectNone: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSelectNone}
      className={cx(
        COLOR_CONTROL_SECONDARY_ACTION_CLASS_NAME,
        'gap-1.5 px-2 text-xs font-semibold text-[var(--sniptale-color-text-secondary)]',
        'hover:text-[var(--sniptale-color-text-primary)]'
      )}
    >
      <DropletOff size={14} aria-hidden="true" />
      <span className="truncate">{translate('editor.runtime.transparent')}</span>
    </button>
  );
}

function NativeColorPickerButton(props: {
  draftColor: string;
  onDraftChange: (value: string) => void;
}) {
  const handleDraftColorChange = (value: string) => {
    const normalizedColor = normalizeHexColor(value);
    if (normalizedColor && normalizedColor !== TRANSPARENT_COLOR) {
      props.onDraftChange(normalizedColor);
    }
  };

  return (
    <label
      aria-label={translate('editor.compact.choose')}
      className={cx(
        COLOR_CONTROL_SECONDARY_ACTION_CLASS_NAME,
        'relative overflow-hidden text-[var(--sniptale-color-text-primary)]'
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-1 rounded-[calc(var(--sniptale-radius-lg)-0.25rem)]"
        style={{ backgroundColor: props.draftColor }}
      />
      <span
        aria-hidden="true"
        className={[
          'relative inline-flex h-6 w-6 items-center justify-center rounded-full',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)]',
          'text-[color:var(--sniptale-color-text-primary)] shadow-sm',
        ].join(' ')}
      >
        <Pipette size={14} />
      </span>
      <input
        aria-label={translate('editor.compact.choose')}
        type="color"
        value={resolvePreviewColor(props.draftColor)}
        onInput={(event) => handleDraftColorChange(event.currentTarget.value)}
        onChange={(event) => handleDraftColorChange(event.currentTarget.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function ApplyDraftButton(props: { applyDisabled: boolean; onApplyDraft: () => void }) {
  return (
    <button
      type="button"
      disabled={props.applyDisabled}
      onClick={props.onApplyDraft}
      className={COLOR_CONTROL_APPLY_ACTION_CLASS_NAME}
    >
      <span className="truncate">{translate('editor.compact.apply')}</span>
    </button>
  );
}

function ColorControlActionRow(props: ColorControlActionRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] gap-2">
      <TransparentColorButton onSelectNone={props.onSelectNone} />
      <NativeColorPickerButton draftColor={props.draftColor} onDraftChange={props.onDraftChange} />
      <ApplyDraftButton applyDisabled={props.applyDisabled} onApplyDraft={props.onApplyDraft} />
    </div>
  );
}

export function ColorControlTrigger(props: {
  displayValue: string;
  expanded: boolean;
  normalizedValue: string | null;
  selectedColor: string;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.title}
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      className={COLOR_CONTROL_TRIGGER_CLASS_NAME}
    >
      <span
        className={cx(
          'h-5 w-5 shrink-0 rounded-full border',
          EDITOR_CONTROL_BORDER_CLASS_NAME,
          props.normalizedValue === TRANSPARENT_COLOR && TRANSPARENT_SWATCH_CLASS_NAME
        )}
        style={{
          backgroundColor:
            props.normalizedValue === TRANSPARENT_COLOR ? 'transparent' : props.selectedColor,
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.displayValue}
        </span>
      </span>
      <ChevronDown
        size={14}
        className={cx(
          'text-[var(--sniptale-color-text-muted-strong)] transition-transform',
          props.expanded && 'rotate-180'
        )}
      />
    </button>
  );
}

export function EditorColorControlExpandedPanel(props: {
  palette: readonly string[];
  recentColors: readonly string[];
  applyDisabled: boolean;
  draftColor: string;
  selectedColor: string;
  title: string;
  onApplyDraft: () => void;
  onChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onSelectNone: () => void;
}) {
  const colorSections = [
    {
      colors: buildColorOptions('', props.recentColors, []),
      label: translate('editor.compact.recentColors'),
    },
    {
      colors: buildColorOptions('', [], props.palette),
      label: translate('editor.compact.palette'),
    },
  ];

  return (
    <div className={COLOR_CONTROL_PANEL_CLASS_NAME}>
      {colorSections.map((section) => (
        <ColorSection
          key={section.label}
          colors={section.colors}
          label={section.label}
          selectedColor={props.selectedColor}
          title={props.title}
          onSelect={props.onChange}
        />
      ))}
      <ColorControlActionRow
        applyDisabled={props.applyDisabled}
        draftColor={props.draftColor}
        onApplyDraft={props.onApplyDraft}
        onDraftChange={props.onDraftChange}
        onSelectNone={props.onSelectNone}
      />
    </div>
  );
}
