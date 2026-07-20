import { Pencil, Trash2 } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import {
  settingsDangerIconButtonClassName,
  settingsInfoIconButtonClassName,
  getSettingsHoverActionsClassName,
} from '../../../section-surface/panel-controls';

export function PresetRowActions(props: {
  isHovered: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={getSettingsHoverActionsClassName(props.isHovered)}>
      <button
        onClick={props.onEdit}
        className={settingsInfoIconButtonClassName}
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={props.onDelete}
        className={settingsDangerIconButtonClassName}
        title={translate('common.actions.delete')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
