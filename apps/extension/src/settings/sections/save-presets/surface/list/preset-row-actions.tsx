import { Pencil, Trash2 } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';
import {
  getSettingsHoverActionsClassName,
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  SettingsSwitch,
} from '../../../../section-surface/panel-controls';

function PresetEnabledToggle(props: { enabled: boolean; onToggleEnabled: () => Promise<void> }) {
  return (
    <SettingsSwitch
      checked={props.enabled}
      size="sm"
      onClick={props.onToggleEnabled}
      title={
        props.enabled
          ? translate('savePresets.section.toggleHiddenTitle')
          : translate('savePresets.section.toggleShownTitle')
      }
    />
  );
}

export function PresetRowActions(props: {
  hovered: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggleEnabled: () => Promise<void>;
  preset: SavePreset;
}) {
  return (
    <div className={getSettingsHoverActionsClassName(props.hovered)}>
      <PresetEnabledToggle enabled={props.preset.enabled} onToggleEnabled={props.onToggleEnabled} />
      <button
        type="button"
        onClick={props.onEdit}
        className={[settingsInfoIconButtonClassName, 'h-8 w-8 p-0'].join(' ')}
        title={translate('common.actions.edit')}
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={props.onDelete}
        className={[settingsDangerIconButtonClassName, 'h-8 w-8 p-0'].join(' ')}
        title={translate('common.actions.delete')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
