import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';
import type { TextControlsProps, TextSettings } from './types';

export function renderTextFontSection(props: TextControlsProps, settings: TextSettings) {
  const label = translate('editor.compact.font');

  return (
    <SelectField
      label={label}
      value={settings.fontFamily}
      onChange={(value) => props.applyTextPatch({ fontFamily: value })}
      options={props.fontOptions}
    />
  );
}
