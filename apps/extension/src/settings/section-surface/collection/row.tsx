import { SettingsCollectionActionTray } from './action-menu';
import { getAdjacentMoveIntent } from './model';
import { SettingsCollectionPrimaryActions, SettingsCollectionReorderHandle } from './row-controls';
import { SettingsCollectionRowIdentity, SettingsCollectionRowMarkers } from './row-identity';
import type {
  SettingsCollectionAction,
  SettingsCollectionItem,
  SettingsCollectionMoveIntent,
  SettingsCollectionResolvedGroup,
} from './types';

type RowProps = {
  activeKeyboardItemId: string | null;
  dragInstructionsId: string;
  dragOffsetY: number;
  dragging: boolean;
  dropAfter: boolean;
  dropBefore: boolean;
  groups: readonly SettingsCollectionResolvedGroup[];
  item: SettingsCollectionItem;
  menuOpen: boolean;
  pointerDragging: boolean;
  reorderingEnabled: boolean;
  onAction(action: SettingsCollectionAction): void;
  onKeyboardCancel(): void;
  onKeyboardMove(itemId: string, direction: -1 | 1): void;
  onKeyboardToggle(itemId: string): void;
  onMove(intent: SettingsCollectionMoveIntent): void;
  onMenuOpenChange(open: boolean): void;
  onPointerStart(
    itemId: string,
    pointerId: number,
    clientX: number,
    clientY: number,
    root: HTMLElement | null
  ): void;
};

const rowClassName = [
  'group relative flex min-h-[52px] items-center gap-3 border-b px-3 py-2 last:border-b-0',
  'border-[var(--sniptale-color-border-subtle)]',
  'transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none',
].join(' ');

const draggingRowClassName = [
  'z-20 cursor-grabbing shadow-lg ring-1 transition-none',
  'bg-[var(--sniptale-color-surface-elevated)]',
  'ring-[var(--sniptale-color-accent)]',
].join(' ');

const dropBeforeClassName = [
  'before:pointer-events-none before:absolute before:inset-x-2 before:-top-px before:z-30',
  'before:h-0.5 before:rounded-full before:bg-[var(--sniptale-color-accent)]',
].join(' ');

const dropAfterClassName = [
  'after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-px after:z-30',
  'after:h-0.5 after:rounded-full after:bg-[var(--sniptale-color-accent)]',
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
      data-settings-collection-dragging={props.dragging || undefined}
      data-settings-collection-drop-after={props.dropAfter || undefined}
      data-settings-collection-drop-before={props.dropBefore || undefined}
      style={
        props.dragging
          ? { transform: `translate3d(0, ${String(props.dragOffsetY)}px, 0)` }
          : undefined
      }
      className={[
        rowClassName,
        props.pointerDragging
          ? ''
          : 'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_68%,transparent)]',
        props.item.enabled === false ? 'opacity-60' : '',
        props.item.busy ? 'cursor-wait' : '',
        props.dragging ? draggingRowClassName : '',
        props.dropBefore ? dropBeforeClassName : '',
        props.dropAfter ? dropAfterClassName : '',
      ].join(' ')}
    >
      {reorder ? (
        <SettingsCollectionReorderHandle
          active={props.activeKeyboardItemId === props.item.id}
          dragInstructionsId={props.dragInstructionsId}
          item={props.item}
          onKeyboardCancel={props.onKeyboardCancel}
          onKeyboardMove={props.onKeyboardMove}
          onKeyboardToggle={props.onKeyboardToggle}
          onPointerStart={props.onPointerStart}
        />
      ) : null}
      <SettingsCollectionRowIdentity item={props.item} />
      <SettingsCollectionRowMarkers item={props.item} />
      <SettingsCollectionPrimaryActions item={props.item} onAction={props.onAction} />
      <SettingsCollectionActionTray
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
