import type { GalleryItem } from './items/types';
import type { GalleryViewMode } from './types';
import { GRID_GAP } from './constants';

type GridMode = Exclude<GalleryViewMode, 'list'>;

export function getGalleryGridCardHeight(mode: GridMode, width: number): number {
  return Math.ceil(width * (9 / 16) + (mode === 'compact-grid' ? 40 : 72));
}

export function getGalleryGridCardWidth(gridWidth: number, columnCount: number): number {
  return Math.max(0, (gridWidth - GRID_GAP * Math.max(0, columnCount - 1)) / columnCount);
}

/** One row model for virtual selection and absolute card placement. */
export function getGalleryGridLayout(args: {
  columnCount: number;
  gridWidth: number;
  items: GalleryItem[];
  viewMode: GridMode;
}) {
  const cardWidth = getGalleryGridCardWidth(args.gridWidth, args.columnCount);
  const totalRows = Math.ceil(args.items.length / args.columnCount);
  const rowHeights = Array<number>(totalRows).fill(0);
  args.items.forEach((_, index) => {
    const row = Math.floor(index / args.columnCount);
    rowHeights[row] = Math.max(
      rowHeights[row] ?? 0,
      getGalleryGridCardHeight(args.viewMode, cardWidth)
    );
  });
  const rowTops = [0];
  rowHeights.forEach((height) => rowTops.push(rowTops[rowTops.length - 1]! + height + GRID_GAP));
  return { cardWidth, rowHeights, rowTops };
}
