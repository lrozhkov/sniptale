import { useMemo, useState } from 'react';

import { translate } from '../../../platform/i18n';
import { SettingsCollectionContent } from './content';
import { SettingsCollectionHeader } from './header';
import { resolveSettingsCollectionGroups } from './model';
import { useSettingsCollectionReorder } from './reorder-interaction';
import type { SettingsCollectionProps } from './types';

export type {
  SettingsCollectionAction,
  SettingsCollectionActionId,
  SettingsCollectionGroup,
  SettingsCollectionItem,
  SettingsCollectionMoveIntent,
  SettingsCollectionProps,
} from './types';
export {
  getAdjacentMoveIntent,
  getSettingsCollectionMoveIntent,
  resolveSettingsCollectionGroups,
} from './model';

export function SettingsCollection(props: SettingsCollectionProps) {
  const [openMenuItemId, setOpenMenuItemId] = useState<string | null>(null);
  const groups = useMemo(
    () => resolveSettingsCollectionGroups(props.items, props.groups),
    [props.groups, props.items]
  );
  const reorder = useSettingsCollectionReorder(groups, props.onMove);
  return (
    <section aria-label={props.ariaLabel} className="space-y-3">
      <SettingsCollectionHeader {...props} />
      <p id={reorder.a11y.dragInstructionsId} className="sr-only">
        {translate('settings.collection.dragInstructions')}
      </p>
      <div aria-live="polite" className="sr-only">
        <span key={reorder.a11y.announcement.sequence}>{reorder.a11y.announcement.message}</span>
      </div>
      <SettingsCollectionContent
        collection={props}
        groups={reorder.groups}
        reorder={reorder}
        openMenuItemId={openMenuItemId}
        onOpenMenuItemChange={setOpenMenuItemId}
      />
    </section>
  );
}
