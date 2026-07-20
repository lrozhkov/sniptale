import { translate } from '../../../../../../platform/i18n';
import { editorResizeHandleClassName, editorTextareaClassName } from '../../constants';
import type { EditorState } from '../types';

export function EditorCustomCssField({ state }: { state: EditorState }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="block text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.customCssLabel')}
          <span className="ml-2 text-[var(--sniptale-color-text-dim)]">
            {translate('highlighter.editor.customCssHint')}
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--sniptale-color-text-secondary)]">
          <input
            type="checkbox"
            checked={state.inheritCustomCss}
            onChange={(event) => state.setInheritCustomCss(event.target.checked)}
            className="h-4 w-4 accent-[var(--sniptale-color-accent)]"
          />
          {translate('highlighter.editor.inheritCustomCssLabel')}
        </label>
      </div>
      <div className="relative">
        <textarea
          value={state.customCss}
          onChange={(event) => state.setCustomCss(event.target.value)}
          placeholder={translate('highlighter.editor.customCssPlaceholder')}
          style={{ height: `${state.textareaHeight}px` }}
          className={editorTextareaClassName}
        />
        <div
          onMouseDown={state.handleResizeStart}
          style={{ cursor: 'ns-resize' }}
          className={editorResizeHandleClassName}
        />
      </div>
    </div>
  );
}
