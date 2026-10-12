export function movePresetOrder(
  presets: readonly { id: string }[],
  intent: { itemId: string; beforeItemId: string | null }
): string[] | null {
  const ids = presets.map((item) => item.id);
  const from = ids.indexOf(intent.itemId);
  if (from < 0) return null;
  ids.splice(from, 1);
  const to = intent.beforeItemId === null ? ids.length : ids.indexOf(intent.beforeItemId);
  if (to < 0) return null;
  ids.splice(to, 0, intent.itemId);
  return ids;
}
