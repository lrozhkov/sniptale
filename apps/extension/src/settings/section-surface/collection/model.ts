import type {
  SettingsCollectionGroup,
  SettingsCollectionItem,
  SettingsCollectionMoveIntent,
  SettingsCollectionResolvedGroup,
} from './types';

function assertUniqueIds(ids: readonly string[], label: string) {
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error(`SettingsCollection: duplicate ${label} id`);
}

export function resolveSettingsCollectionGroups(
  items: readonly SettingsCollectionItem[],
  groups?: readonly SettingsCollectionGroup[]
): readonly SettingsCollectionResolvedGroup[] {
  assertUniqueIds(
    items.map((item) => item.id),
    'item'
  );
  if (!groups) return [{ id: null, items }];

  assertUniqueIds(
    groups.map((group) => group.id),
    'group'
  );
  const itemById = new Map(items.map((item) => [item.id, item]));
  const registeredIds = groups.flatMap((group) => [...group.itemIds]);
  assertUniqueIds(registeredIds, 'registered item');
  if (registeredIds.length !== items.length) {
    throw new Error('SettingsCollection: every grouped item must be registered exactly once');
  }
  for (const id of registeredIds) {
    if (!itemById.has(id)) throw new Error(`SettingsCollection: unknown item id "${id}"`);
  }
  return groups.map((group) => ({
    id: group.id,
    ...(group.label === undefined ? {} : { label: group.label }),
    ...(group.description === undefined ? {} : { description: group.description }),
    items: group.itemIds.map((id) => itemById.get(id)!),
  }));
}

export function getSettingsCollectionMoveIntent(args: {
  groups: readonly SettingsCollectionResolvedGroup[];
  itemId: string;
  targetItemId: string | null;
  placement: 'before' | 'after';
  source: SettingsCollectionMoveIntent['source'];
}): SettingsCollectionMoveIntent | null {
  const sourceGroup = args.groups.find((group) =>
    group.items.some((item) => item.id === args.itemId)
  );
  if (!sourceGroup) return null;
  if (args.targetItemId === args.itemId) return null;
  const targetGroup =
    args.targetItemId === null
      ? sourceGroup
      : args.groups.find((group) => group.items.some((item) => item.id === args.targetItemId));
  if (!targetGroup || targetGroup.id !== sourceGroup.id) return null;

  const currentIds = sourceGroup.items.map((item) => item.id);
  const nextIds = currentIds.filter((id) => id !== args.itemId);
  let beforeItemId = args.targetItemId;
  if (args.placement === 'after' && args.targetItemId !== null) {
    const targetIndex = nextIds.indexOf(args.targetItemId);
    beforeItemId = nextIds[targetIndex + 1] ?? null;
  }
  const insertionIndex = beforeItemId === null ? nextIds.length : nextIds.indexOf(beforeItemId);
  nextIds.splice(insertionIndex, 0, args.itemId);
  if (nextIds.every((id, index) => id === currentIds[index])) return null;
  return { itemId: args.itemId, groupId: sourceGroup.id, beforeItemId, source: args.source };
}

export function getAdjacentMoveIntent(args: {
  groups: readonly SettingsCollectionResolvedGroup[];
  itemId: string;
  direction: -1 | 1;
  source: 'menu' | 'keyboard';
}) {
  const group = args.groups.find((candidate) =>
    candidate.items.some((item) => item.id === args.itemId)
  );
  if (!group) return null;
  const index = group.items.findIndex((item) => item.id === args.itemId);
  const target = group.items[index + args.direction];
  if (!target) return null;
  return getSettingsCollectionMoveIntent({
    groups: args.groups,
    itemId: args.itemId,
    targetItemId: target.id,
    placement: args.direction < 0 ? 'before' : 'after',
    source: args.source,
  });
}
