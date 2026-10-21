import { translate } from '../../../platform/i18n';
import { settingsEmptyStateClassName } from '../classes';
import { useSettingsCollectionLayoutAnimation } from './layout-animation';
import { useSettingsCollectionScrollLayout } from './scroll-layout';
import { SettingsCollectionRow } from './row';
import type { SettingsCollectionReorderInteraction } from './reorder-interaction';
import type { SettingsCollectionProps, SettingsCollectionResolvedGroup } from './types';

export function SettingsCollectionContent(props: {
  collection: SettingsCollectionProps;
  groups: readonly SettingsCollectionResolvedGroup[];
  reorder: SettingsCollectionReorderInteraction;
  openMenuItemId: string | null;
  onMenuOpenChange(itemId: string, open: boolean): void;
}) {
  const { collection, groups, reorder } = props;
  const collectionRootRef = useSettingsCollectionLayoutAnimation(groups);
  useSettingsCollectionScrollLayout(
    collectionRootRef,
    collection.state !== 'loading' && collection.state !== 'error' && collection.items.length > 0
  );
  const pointerDragging = reorder.draggingItemId !== null;
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
      ref={collectionRootRef}
      data-settings-collection-root
      data-settings-collection-layout={collection.layout ?? 'rows'}
      data-settings-collection-pointer-dragging={pointerDragging || undefined}
      data-ui="settings.collection.list-scroll"
      className={[
        'overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
        pointerDragging
          ? 'cursor-grabbing select-none [&_*]:!cursor-grabbing [&_button]:pointer-events-none'
          : '',
        collection.layout === 'tiles' ? '!border-0 !bg-transparent' : 'rounded-[4px] border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface)]',
      ].join(' ')}
    >
      {groups.map((group) => (
        <div
          key={group.id ?? 'ungrouped'}
          className={
            collection.layout === 'tiles'
              ? 'grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2'
              : undefined
          }
        >
          {group.label === undefined && group.description === undefined ? null : (
            <div className="border-b border-[var(--sniptale-color-border-subtle)] px-3 py-2">
              {group.label === undefined ? null : (
                <div className="text-[14px] leading-5 font-semibold">{group.label}</div>
              )}
              {group.description === undefined ? null : (
                <div className="mt-0.5 text-[12px] leading-4 text-[var(--sniptale-color-text-dim)]">
                  {group.description}
                </div>
              )}
            </div>
          )}
          {group.items.map((item) => {
            return (
              <SettingsCollectionRow
                key={item.id}
                item={item}
                dragging={reorder.draggingItemId === item.id}
                pointerDragging={pointerDragging}
                reorderingEnabled={collection.onMove !== undefined}
                dragInstructionsId={reorder.a11y.dragInstructionsId}
                groups={groups}
                activeKeyboardItemId={reorder.a11y.keyboardItemId}
                menuOpen={props.openMenuItemId === item.id}
                onMenuOpenChange={(open) => props.onMenuOpenChange(item.id, open)}
                onAction={collection.onAction}
                {...reorder.row}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
