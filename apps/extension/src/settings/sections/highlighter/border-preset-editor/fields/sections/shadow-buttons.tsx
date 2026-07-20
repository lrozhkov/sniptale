import { translate } from '../../../../../../platform/i18n';
import { SettingsRangeField } from '../../../../../section-surface';
import type { EditorState } from '../types';

export function EditorShadowField({ state }: { state: EditorState }) {
  return (
    <SettingsRangeField
      min="0"
      max="100"
      value={state.shadow}
      onChange={(event) => state.setShadow(parseInt(event.target.value, 10))}
      label={translate('highlighter.editor.shadowLabel')}
      displayValue={state.shadow}
      displaySuffix="%"
      rangeClassName="h-10"
    />
  );
}
