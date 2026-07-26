import { translate } from '../../../../../../platform/i18n';
import { CompactColorSelector } from '../../../../../../ui/color-selector';
import type { EditorState } from '../types';
import { EditorCompactRangeField } from './compact-range-field';
import { EditorStyleButtons } from './style-buttons';

const PRESET_COLOR_PALETTE = [
  '#f97316',
  '#2563eb',
  '#16a34a',
  '#ef4444',
  '#8b5cf6',
  '#facc15',
  '#111827',
  '#f8fafc',
] as const;

function EditorColorField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label className="block text-xs text-[var(--sniptale-color-text-secondary)]">{label}</label>
      <CompactColorSelector
        label={label}
        title={label}
        value={value}
        palette={PRESET_COLOR_PALETTE}
        recentColors={[value]}
        onChange={onChange}
      />
    </div>
  );
}

function EditorColorFields({ state }: { state: EditorState }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <EditorColorField
        label={translate('highlighter.editor.borderColorLabel')}
        value={state.color}
        onChange={state.setColor}
      />
      <EditorColorField
        label={translate('highlighter.editor.fillColorLabel')}
        value={state.fillColor}
        onChange={state.setFillColor}
      />
    </div>
  );
}

function EditorVisualRanges({ state }: { state: EditorState }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <EditorCompactRangeField
        label={translate('highlighter.editor.widthLabel')}
        min={1}
        max={20}
        value={state.width}
        displaySuffix="px"
        onChange={state.setWidth}
      />
      <EditorCompactRangeField
        label={translate('highlighter.editor.radiusLabel')}
        min={0}
        max={50}
        value={state.radius}
        displaySuffix="px"
        onChange={state.setRadius}
      />
      <EditorCompactRangeField
        label={translate('highlighter.editor.strokeOpacityLabel')}
        min={0}
        max={100}
        value={state.strokeOpacity}
        displaySuffix="%"
        onChange={state.setStrokeOpacity}
      />
      <EditorCompactRangeField
        label={translate('highlighter.editor.fillOpacityLabel')}
        min={0}
        max={100}
        value={state.fillOpacity}
        displaySuffix="%"
        onChange={state.setFillOpacity}
      />
    </div>
  );
}

export function EditorBasicSettings({ state }: { state: EditorState }) {
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <EditorColorFields state={state} />
      <EditorVisualRanges state={state} />
      <EditorStyleButtons state={state} />
    </div>
  );
}
