import { translate } from '../../../../../../platform/i18n';

import { editorActiveOptionClassName, editorIdleOptionClassName } from '../../constants';
import { getEditorStyleOptions } from '../helpers';
import type { EditorState } from '../types';

export function EditorStyleButtons({ state }: { state: EditorState }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('highlighter.editor.styleLabel')}
      </label>
      <div className="flex gap-1">
        {getEditorStyleOptions().map((option) => (
          <button
            key={option.value}
            onClick={() => state.setStyle(option.value)}
            className={`flex-1 rounded-md py-1.5 text-xs transition-all ${
              state.style === option.value ? editorActiveOptionClassName : editorIdleOptionClassName
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
