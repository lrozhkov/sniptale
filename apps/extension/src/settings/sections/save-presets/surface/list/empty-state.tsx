import { FolderOpen } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { settingsEmptyStateClassName } from '../../../../section-surface/panel-controls';

export function PresetsListEmptyState() {
  return (
    <div className={settingsEmptyStateClassName}>
      <FolderOpen size={32} className="mx-auto mb-3 text-[var(--sniptale-color-text-dim)]" />
      <p className="mb-1 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('savePresets.section.emptyTitle')}
      </p>
      <p className="text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('savePresets.section.emptyDescription')}
      </p>
    </div>
  );
}
