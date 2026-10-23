import { useState } from 'react';

type PaletteSlots = {
  key: string;
  colors: readonly string[];
  ids: readonly string[];
  nextId: number;
  planned: { colors: readonly string[]; ids: readonly string[] } | null;
};

function reconcileSlots(previous: PaletteSlots, colors: readonly string[]): PaletteSlots {
  const planned = previous.planned;
  if (
    planned &&
    colors.length === planned.colors.length &&
    colors.every((color, index) => color === planned.colors[index])
  )
    return { ...previous, colors, ids: planned.ids, planned: null };
  const available = new Set(previous.ids.map((_id, index) => index));
  const positions = colors.map((color, index) => {
    if (previous.colors[index] !== color) return -1;
    available.delete(index);
    return index;
  });
  for (const [index, color] of colors.entries()) {
    if (positions[index] !== -1) continue;
    const match = [...available].find((position) => previous.colors[position] === color);
    if (match === undefined) continue;
    positions[index] = match;
    available.delete(match);
  }
  let nextId = previous.nextId;
  const ids = positions.map((position, index) => {
    if (position !== -1) return previous.ids[position]!;
    if (available.delete(index)) return previous.ids[index]!;
    return `${previous.key}:${nextId++}`;
  });
  return { ...previous, colors, ids, nextId, planned: null };
}

export function usePalettePresentation(key: string, colors: readonly string[]) {
  const [stored, setStored] = useState<PaletteSlots>(() => ({
    key,
    colors,
    ids: colors.map((_color, index) => `${key}:${index}`),
    nextId: colors.length,
    planned: null,
  }));
  let current = stored;
  if (stored.key !== key) {
    current = {
      key,
      colors,
      ids: colors.map((_color, index) => `${key}:${index}`),
      nextId: colors.length,
      planned: null,
    };
    setStored(current);
  } else if (stored.colors !== colors) {
    current = reconcileSlots(stored, colors);
    setStored(current);
  }
  return {
    ids: current.ids,
    clearPlan: () => setStored((value) => ({ ...value, planned: null })),
    prepareMove(itemIndex: number, beforeIndex: number | null) {
      const ids = [...current.ids];
      const [id] = ids.splice(itemIndex, 1);
      if (!id) return;
      const destination =
        beforeIndex === null ? ids.length : ids.indexOf(current.ids[beforeIndex]!);
      ids.splice(destination, 0, id);
      const plannedColors = ids.map((itemId) => colors[current.ids.indexOf(itemId)]!);
      setStored({ ...current, planned: { ids, colors: plannedColors } });
    },
  };
}
