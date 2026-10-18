import type { Dispatch, SetStateAction } from 'react';

import { translate } from '../../../../../../platform/i18n';
import { CheckboxField } from '../../../../../../ui/compact-inspector-controls';

export function SavePresetEnabledField(props: {
  enabled: boolean;
  setEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <CheckboxField
      label={translate('savePresets.editor.enabledLabel')}
      value={props.enabled}
      onChange={props.setEnabled}
    />
  );
}
