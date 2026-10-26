import type { BrowserDomAnnotationRecord } from '../../parser/page-preparation/annotations';

export type MarkerRange = NonNullable<BrowserDomAnnotationRecord['textMarkers']>[number];

/** Removes only the painted interval, preserving the source and untouched fragments. */
export function subtractMarkerRange(
  marker: MarkerRange,
  start: number,
  end: number
): MarkerRange[] {
  if (end <= marker.start || start >= marker.end) return [marker];
  const fragments: MarkerRange[] = [];
  if (start > marker.start) fragments.push({ ...marker, end: start });
  if (end < marker.end) {
    fragments.push({
      ...marker,
      id: fragments.length ? crypto.randomUUID() : marker.id,
      start: end,
    });
  }
  return fragments;
}

/** Adjacent ranges with the same source and color form one visible marker. */
export function mergeMarkerRanges(markers: readonly MarkerRange[]): MarkerRange[] {
  const sources = new Map<string, MarkerRange[]>();
  for (const marker of markers) {
    const group = sources.get(marker.source) ?? [];
    group.push({ ...marker });
    sources.set(marker.source, group);
  }
  return [...sources.values()].flatMap((group) => {
    const merged: MarkerRange[] = [];
    for (const marker of group.sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1);
      if (previous && previous.color === marker.color && marker.start <= previous.end)
        previous.end = Math.max(previous.end, marker.end);
      else merged.push(marker);
    }
    return merged;
  });
}

/** Identity allocation alone must not create a visible edit or an empty history entry. */
export function equalMarkerRanges(left: readonly MarkerRange[], right: readonly MarkerRange[]) {
  const content = (markers: readonly MarkerRange[]) =>
    markers.map(({ source, start, end, color }) => ({ source, start, end, color }));
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}
