import { SettingsCollectionActionMenu } from './action-menu';
import { getAdjacentMoveIntent } from './model';
import { SettingsCollectionPrimaryActions, SettingsCollectionReorderHandle } from './row-controls';
import { SettingsCollectionRowIdentity } from './row-identity';
import type {
  SettingsCollectionAction,
  SettingsCollectionItem,
  SettingsCollectionMoveIntent,
  SettingsCollectionResolvedGroup,
} from './types';

type RowProps = {
  activeKeyboardItemId: string | null;
  dragInstructionsId: string;
  groups: readonly SettingsCollectionResolvedGroup[];
  item: SettingsCollectionItem;
  menuOpen: boolean;
  reorderingEnabled: boolean;
  onAction(action: SettingsCollectionAction): void;
  onDragEnd(): void;
  onDragStart(itemId: string): void;
  onDrop(targetItemId: string, placement: 'before' | 'after'): void;
  onKeyboardCancel(): void;
  onKeyboardMove(itemId: string, direction: -1 | 1): void;
  onKeyboardToggle(itemId: string): void;
  onMove(intent: SettingsCollectionMoveIntent): void;
  onMenuOpenChange(open: boolean): void;
};

const rowClassName = [
  'group relative flex min-h-[52px] items-center gap-3 border-b px-3 py-2 last:border-b-0',
  'border-[var(--sniptale-color-border-subtle)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_68%,transparent)]',
].join(' ');

export function SettingsCollectionRow(props: RowProps) {
  const group = props.groups.find((candidate) => candidate.items.includes(props.item));
  const index = group?.items.indexOf(props.item) ?? -1;
  const reorder = props.reorderingEnabled && props.item.capabilities.reorder === true;
  const moveUpIntent = getAdjacentMoveIntent({
    groups: props.groups,
    itemId: props.item.id,
    direction: -1,
    source: 'menu',
  });
  const moveDownIntent = getAdjacentMoveIntent({
    groups: props.groups,
    itemId: props.item.id,
    direction: 1,
    source: 'menu',
  });
  const menuItem = reorder
    ? props.item
    : { ...props.item, capabilities: { ...props.item.capabilities, reorder: false } };
  return (
    <div
      data-settings-collection-item={props.item.id}
      className={[
        rowClassName,
        props.item.enabled === false ? 'opacity-60' : '',
        props.item.busy ? 'cursor-wait' : '',
      ].join(' ')}
      onDragOver={(event) => reorder && event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before';
        props.onDrop(props.item.id, placement);
      }}
    >
      {reorder ? (
        <SettingsCollectionReorderHandle
          active={props.activeKeyboardItemId === props.item.id}
          dragInstructionsId={props.dragInstructionsId}
          item={props.item}
          onDragEnd={props.onDragEnd}
          onDragStart={props.onDragStart}
          onKeyboardCancel={props.onKeyboardCancel}
          onKeyboardMove={props.onKeyboardMove}
          onKeyboardToggle={props.onKeyboardToggle}
        />
      ) : null}
      <SettingsCollectionRowIdentity item={props.item} />
      <SettingsCollectionPrimaryActions item={props.item} onAction={props.onAction} />
      <SettingsCollectionActionMenu
        item={menuItem}
        canMoveUp={index > 0}
        canMoveDown={index >= 0 && index < (group?.items.length ?? 0) - 1}
        moveUpIntent={moveUpIntent}
        moveDownIntent={moveDownIntent}
        onAction={props.onAction}
        onMove={props.onMove}
        open={props.menuOpen}
        onOpenChange={props.onMenuOpenChange}
      />
    </div>
  );
}
