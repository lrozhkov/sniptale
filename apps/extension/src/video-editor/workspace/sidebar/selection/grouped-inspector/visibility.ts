import type { InspectorGroupDefinition } from './types';

export function resolveVisibleInspectorGroups<TId extends string>(
  groups: readonly InspectorGroupDefinition<TId>[]
) {
  return groups
    .filter((group) => group.visible !== false)
    .sort((a, b) => Number(a.semantic === 'info') - Number(b.semantic === 'info'));
}
