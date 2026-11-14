import type { EditorLayerItem } from '../../../features/editor/document/types';

/** Projects a selected block into list order without moving it below a pinned source. */
export function projectLayerDropOrder(
  layers: readonly EditorLayerItem[],
  order: readonly string[],
  movingIds: readonly string[],
  beforeId: string | null
): string[] {
  const rest = order.filter((id) => !movingIds.includes(id));
  const fixedIndex = rest.findIndex((id) =>
    layers.some((layer) => layer.id === id && layer.type === 'source-image' && !layer.reorderable)
  );
  let index = beforeId === null ? rest.length : rest.indexOf(beforeId);
  if (fixedIndex >= 0) index = Math.min(index, fixedIndex);
  const result = [...rest];
  result.splice(Math.max(0, index), 0, ...movingIds);
  return result;
}

/** A changed order, selection, or movement constraint invalidates an active gesture. */
export function hasLayerReorderChanged(
  previous: readonly EditorLayerItem[],
  next: readonly EditorLayerItem[]
): boolean {
  return (
    previous.length !== next.length ||
    previous.some((layer, index) => {
      const item = next[index];
      return (
        item?.id !== layer.id ||
        item.locked !== layer.locked ||
        item.selected !== layer.selected ||
        item.immutable !== layer.immutable ||
        item.reorderable !== layer.reorderable
      );
    })
  );
}
