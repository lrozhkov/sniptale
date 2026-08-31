import type {
  FullPageCaptureGeometry,
  FullPageQualityPolicy,
} from '../../../contracts/full-page-capture';
import { assertFullPageGeometryBudget } from './budgets';

const FULL_PAGE_TILE_OVERLAP_CSS_PX = 64;
const MAX_FULL_PAGE_TILE_COUNT = 4_096;

export type FullPageTilePlan = {
  column: number;
  firstColumn: boolean;
  firstRow: boolean;
  lastColumn: boolean;
  lastRow: boolean;
  row: number;
  sourceInsetX: number;
  sourceInsetY: number;
  targetX: number;
  targetY: number;
};

function createAxisPositions(extent: number, viewport: number): number[] {
  if (extent <= viewport) return [0];
  const step = Math.max(1, viewport - FULL_PAGE_TILE_OVERLAP_CSS_PX);
  const last = extent - viewport;
  const positions: number[] = [];
  for (let offset = 0; offset < extent; offset += step) {
    const clamped = Math.min(offset, last);
    if (positions.at(-1) !== clamped) positions.push(clamped);
    if (clamped === last) break;
  }
  return positions;
}

function countAxisPositions(extent: number, viewport: number): number {
  if (extent <= viewport) return 1;
  const step = Math.max(1, viewport - FULL_PAGE_TILE_OVERLAP_CSS_PX);
  return Math.ceil((extent - viewport) / step) + 1;
}

export function createFullPageTilePlan(
  geometry: FullPageCaptureGeometry,
  qualityPolicy?: FullPageQualityPolicy
): FullPageTilePlan[] {
  assertFullPageGeometryBudget(geometry, qualityPolicy);
  const columnCount = countAxisPositions(geometry.extentWidth, geometry.rootViewport.width);
  const rowCount = countAxisPositions(geometry.extentHeight, geometry.rootViewport.height);
  if (
    !Number.isSafeInteger(columnCount) ||
    !Number.isSafeInteger(rowCount) ||
    columnCount * rowCount > MAX_FULL_PAGE_TILE_COUNT
  ) {
    throw new Error('Full-page screenshot requires too many raster tiles');
  }
  const xs = createAxisPositions(geometry.extentWidth, geometry.rootViewport.width);
  const ys = createAxisPositions(geometry.extentHeight, geometry.rootViewport.height);
  return ys.flatMap((targetY, row) =>
    xs.map((targetX, column) => ({
      column,
      firstColumn: column === 0,
      firstRow: row === 0,
      lastColumn: column === xs.length - 1,
      lastRow: row === ys.length - 1,
      row,
      sourceInsetX:
        column === 0
          ? 0
          : Math.max(0, (xs[column - 1] ?? 0) + geometry.rootViewport.width - targetX),
      sourceInsetY:
        row === 0 ? 0 : Math.max(0, (ys[row - 1] ?? 0) + geometry.rootViewport.height - targetY),
      targetX,
      targetY,
    }))
  );
}
