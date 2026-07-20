import { Monitor } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { settingsEmptyStateClassName } from '../../../../section-surface/panel-controls';

export function PresetsListEmptyState() {
  return (
    <div className={settingsEmptyStateClassName}>
      <Monitor size={32} className="mx-auto mb-3 text-[var(--sniptale-color-text-dim)]" />
      <p className="mb-1 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('viewportPresets.section.emptyTitle')}
      </p>
      <p className="text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('viewportPresets.section.emptyDescription')}
      </p>
    </div>
  );
}
