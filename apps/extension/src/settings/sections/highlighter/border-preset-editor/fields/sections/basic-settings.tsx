import { translate } from '../../../../../../platform/i18n';
import { editorInputClassName } from '../../constants';
import { SettingsRangeField } from '../../../../../section-surface';
import { EditorStyleButtons } from './style-buttons';
import type { EditorState } from '../types';

function EditorRangeField({
  displaySuffix,
  label,
  max,
  min,
  onChange,
  value,
}: {
  displaySuffix?: string;
  label: string;
  max: string;
  min: string;
  onChange: (value: string) => void;
  value: number;
}) {
  return (
    <SettingsRangeField
      min={min}
      max={max}
      value={value}
      onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
      label={label}
      displayValue={value}
      displaySuffix={displaySuffix}
      rangeClassName="h-10"
    />
  );
}

function getNativeColorValue(color: string): string {
  return /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7) : '#000000';
}

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
    <div>
      <label className="mb-1.5 block text-xs text-[var(--sniptale-color-text-secondary)]">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={getNativeColorValue(value)}
          onChange={(event) => onChange(event.target.value)}
          className={[
            'h-10 w-10 cursor-pointer rounded-lg border',
            'border-[var(--sniptale-color-border-soft)] bg-transparent',
          ].join(' ')}
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${editorInputClassName} flex-1 font-mono`}
        />
      </div>
    </div>
  );
}

function renderEditorColorFields(state: EditorState) {
  return (
    <div className="space-y-3">
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

function renderEditorWidthStyleFields(state: EditorState) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <EditorRangeField
        label={translate('highlighter.editor.widthLabel')}
        min="1"
        max="20"
        value={state.width}
        displaySuffix="px"
        onChange={(value) => state.setWidth(parseInt(value, 10))}
      />
      <EditorStyleButtons state={state} />
    </div>
  );
}

function renderEditorStrokeFields(state: EditorState) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <EditorRangeField
        label={translate('highlighter.editor.radiusLabel')}
        min="0"
        max="50"
        value={state.radius}
        displaySuffix="px"
        onChange={(value) => state.setRadius(parseInt(value, 10))}
      />
      <EditorRangeField
        label={translate('highlighter.editor.strokeOpacityLabel')}
        min="0"
        max="100"
        value={state.strokeOpacity}
        displaySuffix="%"
        onChange={(value) => state.setStrokeOpacity(parseInt(value, 10))}
      />
    </div>
  );
}

function renderEditorFillFields(state: EditorState) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <EditorRangeField
        label={translate('highlighter.editor.fillOpacityLabel')}
        min="0"
        max="100"
        value={state.fillOpacity}
        displaySuffix="%"
        onChange={(value) => state.setFillOpacity(parseInt(value, 10))}
      />
      <EditorRangeField
        label={translate('highlighter.editor.opacityLabel')}
        min="0"
        max="100"
        value={state.opacity}
        displaySuffix="%"
        onChange={(value) => state.setOpacity(parseInt(value, 10))}
      />
    </div>
  );
}

export function EditorBasicSettings({ state }: { state: EditorState }) {
  return (
    <div className="flex-1 space-y-4">
      {renderEditorColorFields(state)}
      {renderEditorWidthStyleFields(state)}
      {renderEditorStrokeFields(state)}
      {renderEditorFillFields(state)}
    </div>
  );
}
