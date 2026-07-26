import { translate } from '../../../../../../platform/i18n';
import { editorResizeHandleClassName, editorTextareaClassName } from '../../constants';
import type { EditorState } from '../types';

export function EditorCustomCssField({ state }: { state: EditorState }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <label className="block text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('highlighter.editor.customCssLabel')}
        </label>
        <span
          title={translate('highlighter.editor.customCssHint')}
          className="truncate text-[11px] text-[var(--sniptale-color-text-dim)]"
        >
          {translate('highlighter.editor.customCssHint')}
        </span>
      </div>
      <div className="relative">
        <textarea
          value={state.customCss}
          onChange={(event) => {
            const nextValue = event.target.value;
            state.setCustomCss(nextValue);
            state.setInheritCustomCss(Boolean(nextValue.trim()));
          }}
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
