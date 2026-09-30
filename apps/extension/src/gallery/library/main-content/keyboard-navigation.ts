import { isGallerySelectableItem, type GalleryItem } from '../items';
import type { GalleryGridMetrics, GalleryViewMode } from '../types';
import { buildGalleryListUnits } from './recording-units';

export interface GalleryCardNavigation {
  activeId: string | null;
}

export interface GalleryKeyboardUnit {
  id: string;
  item: GalleryItem;
  selectableIds: string[];
}

/** Shares the renderer's grouping and member order instead of treating filtered order as row order. */
export function buildGalleryKeyboardUnits(
  items: GalleryItem[],
  viewMode: GalleryViewMode
): GalleryKeyboardUnit[] {
  return buildGalleryListUnits(items).flatMap((unit) => {
    if (unit.kind === 'item') {
      return [
        {
          id: unit.item.id,
          item: unit.item,
          selectableIds: isGallerySelectableItem(unit.item) ? [unit.item.id] : [],
        },
      ];
    }
    if (viewMode === 'list') {
      return unit.items.map((item) => ({
        id: item.id,
        item,
        selectableIds: isGallerySelectableItem(item) ? [item.id] : [],
      }));
    }
    const item = unit.items[0];
    return item
      ? [
          {
            id: unit.representativeId,
            item,
            selectableIds: unit.items.filter(isGallerySelectableItem).map((member) => member.id),
          },
        ]
      : [];
  });
}

export function getGalleryNavigationIndex(
  key: string,
  index: number,
  count: number,
  columns: number
): number {
  if (count === 0) return -1;
  const current = Math.max(0, Math.min(index, count - 1));
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'ArrowLeft':
      return Math.max(0, current - 1);
    case 'ArrowRight':
      return Math.min(count - 1, current + 1);
    case 'ArrowUp':
      return current < columns ? current : current - columns;
    case 'ArrowDown':
      return Math.floor(current / columns) === Math.floor((count - 1) / columns)
        ? current
        : Math.min(count - 1, current + columns);
    default:
      return current;
  }
}

export function getGalleryUnitRangeEndpoints(
  units: GalleryKeyboardUnit[],
  anchor: number,
  target: number
) {
  const anchorIds = units[anchor]?.selectableIds ?? [];
  const targetIds = units[target]?.selectableIds ?? [];
  const forward = target >= anchor;
  const anchorId = forward ? anchorIds[0] : anchorIds.at(-1);
  const targetId = forward ? targetIds.at(-1) : targetIds[0];
  return anchorId && targetId ? { anchorId, targetId } : null;
}

export function getGalleryVisibleScroll(args: {
  top: number;
  bottom: number;
  scrollTop: number;
  height: number;
  stickyHeight: number;
}): number {
  if (
    args.top < args.scrollTop + args.stickyHeight ||
    args.bottom - args.top > args.height - args.stickyHeight
  ) {
    return Math.max(0, args.top - args.stickyHeight);
  }
  return args.bottom > args.scrollTop + args.height
    ? Math.max(0, args.bottom - args.height)
    : args.scrollTop;
}

export function getGalleryGridUnitBounds(
  index: number,
  metrics: GalleryGridMetrics,
  padding: number
) {
  const row = Math.floor(index / metrics.columnCount);
  return {
    top: (metrics.rowTops[row] ?? 0) + padding,
    bottom: (metrics.rowTops[row + 1] ?? 0) + padding,
  };
}
