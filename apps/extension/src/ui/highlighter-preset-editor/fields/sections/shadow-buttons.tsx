import { translate } from '../../../../platform/i18n';
import type { EditorState } from '../types';
import { EditorCompactRangeField } from './compact-range-field';

export function EditorShadowField({ state }: { state: EditorState }) {
  return (
    <EditorCompactRangeField
      min={0}
      max={100}
      value={state.shadow}
      onChange={state.setShadow}
      label={translate('highlighter.editor.shadowLabel')}
      displaySuffix="%"
    />
  );
}
