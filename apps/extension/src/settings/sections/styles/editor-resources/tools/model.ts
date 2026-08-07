export function reorderToolPresetIds(
  items: ReadonlyArray<{ id: string }>,
  draggedId: string,
  targetId: string
) {
  const next = [...items];
  const from = next.findIndex((item) => item.id === draggedId);
  const to = next.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return null;
  const [item] = next.splice(from, 1);
  if (!item) return null;
  next.splice(to, 0, item);
  return next.map(({ id }) => id);
}
