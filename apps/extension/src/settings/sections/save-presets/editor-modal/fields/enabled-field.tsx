import type { Dispatch, SetStateAction } from 'react';

import { translate } from '../../../../../platform/i18n';
import { SettingsSwitch } from '../../../../section-surface/panel-controls';
import { settingsToggleRowClassName } from '../../../../section-surface';

function SavePresetEditorEnabledToggle(props: { enabled: boolean; onToggle: () => void }) {
  return <SettingsSwitch checked={props.enabled} onClick={props.onToggle} />;
}

export function SavePresetEnabledField(props: {
  enabled: boolean;
  setEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className={settingsToggleRowClassName}>
      <span className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('savePresets.editor.enabledLabel')}
      </span>
      <SavePresetEditorEnabledToggle
        enabled={props.enabled}
        onToggle={() => props.setEnabled(!props.enabled)}
      />
    </div>
  );
}
