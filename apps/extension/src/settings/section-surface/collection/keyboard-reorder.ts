import type { SettingsCollectionMoveIntent, SettingsCollectionResolvedGroup } from './types';

export type SettingsCollectionKeyboardPreview = {
  baselineItemIds: readonly string[];
  groupId: string | null;
  itemId: string;
  itemIds: readonly string[];
};

export function createKeyboardPreview(
  groups: readonly SettingsCollectionResolvedGroup[],
  itemId: string
): SettingsCollectionKeyboardPreview | null {
  const group = groups.find((candidate) => candidate.items.some((item) => item.id === itemId));
  if (!group) return null;
  const itemIds = group.items.map((item) => item.id);
  return { baselineItemIds: itemIds, groupId: group.id, itemId, itemIds };
}

export function isKeyboardPreviewCurrent(
  groups: readonly SettingsCollectionResolvedGroup[],
  preview: SettingsCollectionKeyboardPreview
): boolean {
  const group = groups.find((candidate) => candidate.id === preview.groupId);
  if (!group) return false;
  const currentItemIds = group.items.map((item) => item.id);
  const movedItem = group.items.find((item) => item.id === preview.itemId);
  return (
    movedItem?.capabilities.reorder === true &&
    currentItemIds.length === preview.baselineItemIds.length &&
    currentItemIds.every((itemId, index) => preview.baselineItemIds[index] === itemId)
  );
}

export function moveKeyboardPreview(
  preview: SettingsCollectionKeyboardPreview,
  direction: -1 | 1
): SettingsCollectionKeyboardPreview {
  const currentIndex = preview.itemIds.indexOf(preview.itemId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= preview.itemIds.length) return preview;
  const itemIds = [...preview.itemIds];
  [itemIds[currentIndex], itemIds[nextIndex]] = [itemIds[nextIndex]!, itemIds[currentIndex]!];
  return { ...preview, itemIds };
}

export function resolveKeyboardPreviewGroups(
  groups: readonly SettingsCollectionResolvedGroup[],
  preview: SettingsCollectionKeyboardPreview | null
): readonly SettingsCollectionResolvedGroup[] {
  if (!preview) return groups;
  return groups.map((group) => {
    if (group.id !== preview.groupId) return group;
    const itemsById = new Map(group.items.map((item) => [item.id, item]));
    const items = preview.itemIds.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      return item ? [item] : [];
    });
    return items.length === group.items.length ? { ...group, items } : group;
  });
}

export function getKeyboardPreviewIntent(
  groups: readonly SettingsCollectionResolvedGroup[],
  preview: SettingsCollectionKeyboardPreview
): SettingsCollectionMoveIntent | null {
  if (!isKeyboardPreviewCurrent(groups, preview)) return null;
  const originalIds = preview.baselineItemIds;
  if (originalIds.every((itemId, index) => preview.itemIds[index] === itemId)) return null;
  const itemIndex = preview.itemIds.indexOf(preview.itemId);
  if (itemIndex < 0) return null;
  return {
    itemId: preview.itemId,
    groupId: preview.groupId,
    beforeItemId: preview.itemIds[itemIndex + 1] ?? null,
    source: 'keyboard',
  };
}
