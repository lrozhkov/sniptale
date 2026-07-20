import type { Dispatch, SetStateAction } from 'react';

import { settingsModalFieldSurfaceClassName } from '../../../../section-surface/panel-controls';
import { SavePresetEnabledField } from './enabled-field';
import { SavePresetNameField } from './name-field';
import { SavePresetPathField } from './path-field';

export function SavePresetEditorFields(props: {
  enabled: boolean;
  name: string;
  path: string;
  setEnabled: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setPath: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="space-y-4">
      <div className={settingsModalFieldSurfaceClassName}>
        <SavePresetNameField name={props.name} setName={props.setName} />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <SavePresetPathField path={props.path} setPath={props.setPath} />
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <SavePresetEnabledField enabled={props.enabled} setEnabled={props.setEnabled} />
      </div>
    </div>
  );
}
