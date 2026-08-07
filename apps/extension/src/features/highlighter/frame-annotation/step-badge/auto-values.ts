import { CYRILLIC_ALPHABET, LATIN_ALPHABET, type StepBadgeSettings } from '../../contracts';

type StepBadgeOwner = {
  id: string;
  stepBadge?: StepBadgeSettings;
};

export function sortStepBadgeOwnersByStoredOrder<T extends StepBadgeOwner>(
  owners: readonly T[],
  orderMap: ReadonlyMap<string, number>,
  fallbackCompare: (left: T, right: T) => number
): T[] {
  return [...owners].sort((left, right) => {
    const leftOrder = orderMap.get(left.id);
    const rightOrder = orderMap.get(right.id);
    if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder)
      return leftOrder - rightOrder;
    if (leftOrder != null && rightOrder == null) return -1;
    if (leftOrder == null && rightOrder != null) return 1;
    return fallbackCompare(left, right);
  });
}

export function applyAutoStepBadgeValues<T extends StepBadgeOwner>(
  owners: readonly T[],
  orderMap: ReadonlyMap<string, number> = new Map(),
  excludeOwnerId?: string
): T[] {
  const originalIndex = new Map(owners.map((owner, index) => [owner.id, index]));
  const groups = new Map<string, T[]>();
  owners
    .filter(
      (owner) =>
        owner.id !== excludeOwnerId &&
        owner.stepBadge?.enabled === true &&
        owner.stepBadge.auto !== false
    )
    .forEach((owner) => {
      const key = getStepBadgeGroupKey(owner.stepBadge!);
      const group = groups.get(key) ?? [];
      group.push(owner);
      groups.set(key, group);
    });

  const values = new Map<string, string>();
  groups.forEach((group, key) => {
    const ordered = sortStepBadgeOwnersByStoredOrder(
      group,
      orderMap,
      (left, right) => (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0)
    );
    const alphabet = resolveGroupAlphabet(key);
    ordered.forEach((owner, index) => {
      values.set(owner.id, key === 'number' ? String(index + 1) : (alphabet?.[index] ?? ''));
    });
  });

  const normalized = owners.map((owner) => {
    const value = values.get(owner.id);
    return value === undefined || owner.stepBadge?.value === value
      ? owner
      : { ...owner, stepBadge: { ...owner.stepBadge, value } };
  });
  return Array.isArray(owners) && normalized.every((owner, index) => owner === owners[index])
    ? (owners as T[])
    : normalized;
}

function getStepBadgeGroupKey(settings: StepBadgeSettings): string {
  return settings.type === 'number' ? 'number' : `letter:${settings.alphabet ?? 'cyrillic'}`;
}

function resolveGroupAlphabet(key: string): readonly string[] | null {
  if (!key.startsWith('letter:')) return null;
  return key === 'letter:cyrillic' ? CYRILLIC_ALPHABET : LATIN_ALPHABET;
}
