import { translate } from '../../../platform/i18n';
import { settingsEmptyStateClassName } from '../classes';
import { SettingsCollectionRow } from './row';
import type { SettingsCollectionReorderInteraction } from './reorder-interaction';
import type { SettingsCollectionProps, SettingsCollectionResolvedGroup } from './types';

export function SettingsCollectionContent(props: {
  collection: SettingsCollectionProps;
  groups: readonly SettingsCollectionResolvedGroup[];
  reorder: SettingsCollectionReorderInteraction;
  openMenuItemId: string | null;
  onOpenMenuItemChange(itemId: string | null): void;
}) {
  const { collection, groups, reorder } = props;
  if (collection.state === 'loading') {
    return (
      <div
        className={settingsEmptyStateClassName}
        aria-busy="true"
        data-testid="settings-card-loading"
      >
        {translate('common.states.loading')}
      </div>
    );
  }
  if (collection.state === 'error') {
    return (
      <div className={settingsEmptyStateClassName} role="alert">
        {collection.errorState}
      </div>
    );
  }
  if (collection.items.length === 0) {
    return <div className={settingsEmptyStateClassName}>{collection.emptyState}</div>;
  }
  return (
    <div
      className={[
        'overflow-visible rounded-xl border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface)]',
      ].join(' ')}
    >
      {groups.map((group) => (
        <div key={group.id ?? 'ungrouped'}>
          {group.label === undefined && group.description === undefined ? null : (
            <div className="border-b border-[var(--sniptale-color-border-subtle)] px-3 py-2">
              {group.label === undefined ? null : (
                <div className="text-xs font-semibold">{group.label}</div>
              )}
              {group.description === undefined ? null : (
                <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-dim)]">
                  {group.description}
                </div>
              )}
            </div>
          )}
          {group.items.map((item) => (
            <SettingsCollectionRow
              key={item.id}
              item={item}
              reorderingEnabled={collection.onMove !== undefined}
              dragInstructionsId={reorder.a11y.dragInstructionsId}
              groups={groups}
              activeKeyboardItemId={reorder.a11y.keyboardItemId}
              menuOpen={props.openMenuItemId === item.id}
              onMenuOpenChange={(open) => props.onOpenMenuItemChange(open ? item.id : null)}
              onAction={collection.onAction}
              {...reorder.row}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
