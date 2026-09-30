export interface GalleryToggleSelectionOptions {
  shiftKey?: boolean;
  orderedIds?: readonly string[];
}

export interface GallerySelectionRange {
  anchorId: string;
  targetId: string;
  orderedIds: readonly string[];
  baseSelectedIds: ReadonlySet<string>;
}

/** A range derives from its initial snapshot so reversing direction removes only that range. */
export function resolveGallerySelectionRange(
  range: GallerySelectionRange,
  selectableIds: ReadonlySet<string>
): Set<string> | null {
  const orderedIds = [...new Set(range.orderedIds)].filter((id) => selectableIds.has(id));
  const anchor = orderedIds.indexOf(range.anchorId);
  const target = orderedIds.indexOf(range.targetId);
  if (anchor < 0 || target < 0) return null;
  const start = Math.min(anchor, target);
  const end = Math.max(anchor, target);
  return new Set([...range.baseSelectedIds, ...orderedIds.slice(start, end + 1)]);
}
