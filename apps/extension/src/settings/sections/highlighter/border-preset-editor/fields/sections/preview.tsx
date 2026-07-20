import { AlertCircle, Eye } from 'lucide-react';

import { translate } from '../../../../../../platform/i18n';
import { editorPreviewFrameClassName } from '../../constants';
import { getEditorPreviewFrameClassName } from '../helpers';
import type { EditorState } from '../types';

export function EditorPreview({ state }: { state: EditorState }) {
  return (
    <div className="flex-shrink-0">
      <label className="mb-2 flex items-center gap-1 text-xs text-[var(--sniptale-color-text-secondary)]">
        <Eye size={12} />
        {translate('highlighter.editor.previewLabel')}
      </label>
      <div
        className={`${editorPreviewFrameClassName} ${getEditorPreviewFrameClassName(state.cssError)}`}
      >
        <div style={state.previewStyle} className="transition-all duration-200" />
      </div>
      {state.cssError ? (
        <div className="mt-2 flex max-w-[128px] items-start gap-1.5">
          <AlertCircle
            size={12}
            className="mt-0.5 flex-shrink-0 text-[var(--sniptale-color-danger)]"
          />
          <p className="text-xs leading-tight text-[var(--sniptale-color-danger)]">
            {state.cssError}
          </p>
        </div>
      ) : null}
    </div>
  );
}
