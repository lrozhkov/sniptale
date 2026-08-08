export function reorderToolPresetIdsBefore(
  items: ReadonlyArray<{ id: string }>,
  itemId: string,
  beforeItemId: string | null
) {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(itemId);
  if (from < 0) return null;
  ids.splice(from, 1);
  const to = beforeItemId === null ? ids.length : ids.indexOf(beforeItemId);
  if (to < 0) return null;
  ids.splice(to, 0, itemId);
  return ids;
}
