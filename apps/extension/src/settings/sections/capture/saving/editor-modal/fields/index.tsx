import type { Dispatch, SetStateAction } from 'react';

import { settingsModalFieldSurfaceClassName } from '../../../../../section-surface/panel-controls';
import { SavePresetEnabledField } from './enabled-field';
import { SavePresetNameField } from './name-field';
import { SavePresetPathField } from './path-field';
import { resolvePresetFolderPreview } from '../preview-path';
import { translate } from '../../../../../../platform/i18n';

export function SavePresetEditorFields(props: {
  enabled: boolean;
  name: string;
  path: string;
  previousPath?: string;
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
        <div className="mt-3 border-t border-[var(--sniptale-color-border-soft)] pt-3">
          <p className="text-xs font-medium text-[var(--sniptale-color-text-secondary)]">
            {translate('savePresets.editor.previewLabel')}
          </p>
          <output
            className="mt-1 block break-all rounded-md bg-[var(--sniptale-color-surface-canvas)]
              px-3 py-2 font-mono text-sm text-[var(--sniptale-color-text-primary)]"
          >
            {translate('savePresets.editor.previewRoot')}/
            {resolvePresetFolderPreview(props.path, props.previousPath)}
          </output>
          <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
            {translate('savePresets.editor.previewHint')}
          </p>
        </div>
      </div>
      <div className={settingsModalFieldSurfaceClassName}>
        <SavePresetEnabledField enabled={props.enabled} setEnabled={props.setEnabled} />
      </div>
    </div>
  );
}
