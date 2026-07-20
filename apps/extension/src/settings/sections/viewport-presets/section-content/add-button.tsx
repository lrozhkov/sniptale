import { Plus } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { settingsAddButtonClassName } from '../../../section-surface/panel-controls';

export function AddViewportPresetButton(props: { onClick: () => void }) {
  return (
    <button onClick={props.onClick} className={settingsAddButtonClassName}>
      <Plus size={16} />
      {translate('viewportPresets.section.addButton')}
    </button>
  );
}
