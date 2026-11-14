import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements/library';

type LocalCatalog = Awaited<ReturnType<EditorVectorLibrary['readCatalog']>>;
export interface EditorVectorUserCatalog {
  value: string;
  label: string;
  kind: 'collection' | 'imported-prefix' | 'imported-svg';
  prefix: string | null;
}

/** Projects durable collections and unassigned legacy imports without changing stored identities. */
export function getEditorVectorUserCatalogs(
  local: LocalCatalog,
  favoritesOnly = false
): EditorVectorUserCatalog[] {
  const favoriteIds = new Set(
    local.items.filter((item) => item.favorite).map((item) => item.definitionId)
  );
  const rows: EditorVectorUserCatalog[] = local.collections
    .filter(
      (collection) =>
        !favoritesOnly ||
        local.members.some(
          (member) => member.collectionId === collection.id && favoriteIds.has(member.definitionId)
        )
    )
    .map((collection) => ({
      value: `local:${collection.id}`,
      label: collection.name,
      kind: 'collection',
      prefix: null,
    }));
  const assignedIds = new Set(local.members.map((member) => member.definitionId));
  const imported = new Map<string, EditorVectorUserCatalog>();
  for (const item of local.items) {
    if (!item.imported || assignedIds.has(item.definitionId) || (favoritesOnly && !item.favorite))
      continue;
    const value = item.prefix === null ? 'imported:svg' : `imported:prefix:${item.prefix}`;
    if (!imported.has(value))
      imported.set(value, {
        value,
        label: item.prefix ?? '',
        kind: item.prefix === null ? 'imported-svg' : 'imported-prefix',
        prefix: item.prefix,
      });
  }
  return [...rows, ...imported.values()];
}
