import { translate } from '../../../../../platform/i18n';
import { editorInputClassName } from '../constants';
import type { EditorState } from './types';
import {
  EditorBasicSettings,
  EditorCustomCssField,
  EditorPaddingFields,
  EditorPreview,
  EditorShadowField,
} from './sections';

export function BorderPresetEditorFields({ state }: { state: EditorState }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.nameLabel')}
        </label>
        <input
          type="text"
          value={state.name}
          onChange={(event) => state.setName(event.target.value)}
          placeholder={translate('highlighter.editor.namePlaceholder')}
          className={[
            editorInputClassName,
            'placeholder:text-[var(--sniptale-color-text-dim)]',
            'focus:ring-1 focus:ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
          ].join(' ')}
        />
      </div>
      <div className="flex gap-6">
        <EditorPreview state={state} />
        <EditorBasicSettings state={state} />
      </div>
      <EditorShadowField state={state} />
      <EditorPaddingFields padding={state.padding} updatePadding={state.updatePadding} />
      <EditorCustomCssField state={state} />
    </div>
  );
}
