import { translate } from '../../../platform/i18n';
import { editorInputClassName } from '../constants';
import type { EditorState } from './types';
import { EditorBasicSettings } from './sections/basic-settings';
import { EditorCustomCssField } from './sections/custom-css-field';
import { EditorPaddingFields } from './sections/padding-fields';
import { EditorPreview } from './sections/sample';
import { EditorShadowField } from './sections/shadow-buttons';

export function BorderPresetEditorFields({ state }: { state: EditorState }) {
  return (
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)]">
        <EditorPreview state={state} />
        <EditorBasicSettings state={state} />
      </div>
      <div
        className={[
          'grid grid-cols-1 items-start gap-4',
          'sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]',
        ].join(' ')}
      >
        <EditorShadowField state={state} />
        <EditorPaddingFields padding={state.padding} updatePadding={state.updatePadding} />
      </div>
      <EditorCustomCssField state={state} />
    </div>
  );
}
