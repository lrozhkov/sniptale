import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  fitGuideRowInsertion,
  type GuideBlockPlacement,
} from '../../features/scenario/project/public';

type MeasuredBlock = { element: HTMLElement; rect: DOMRect; width: number };
type TargetFrame = { itemId: string; width: number; bounds: DOMRect };
export type GuideDropTarget = {
  itemId: string;
  element: HTMLElement;
  placement: GuideBlockPlacement['placement'];
  anchorBlockId?: string;
  width: number;
  preview: { left: number; top: number; width: number; height: number };
  neighbor?: { left: number; top: number; width: number; height: number; percent: number };
};

/** DOM geometry selects an intent; canonical widths use the same negotiation as the commit owner. */
export function guideBlockDropTarget(
  container: HTMLElement,
  sourceId: string,
  x: number,
  y: number,
  sourceWidth: number
): GuideDropTarget | null {
  const itemId = container.dataset['reorderStep'];
  if (!itemId) return null;
  const rows = measureRows(container);
  const frame = { itemId, width: sourceWidth, bounds: container.getBoundingClientRect() };
  if (!rows.length)
    return {
      itemId,
      element: container,
      placement: 'row-before',
      width: sourceWidth,
      preview: {
        left: frame.bounds.left,
        top: frame.bounds.top,
        width: frame.bounds.width,
        height: 4,
      },
    };
  const row = rows.reduce((best, next) =>
    rowDistance(next, y) < rowDistance(best, y) ? next : best
  );
  if (row.every((entry) => entry.element.dataset['blockId'] === sourceId)) return null;
  const top = row[0]!.rect.top;
  const bottom = rowBottom(row);
  const threshold = Math.min(16, (bottom - top) / 4);
  if (y <= top + threshold || y >= bottom - threshold) {
    const boundary = rows.indexOf(row) + (y >= bottom - threshold ? 1 : 0);
    return rowBoundaryTarget(rows, boundary, sourceId, frame);
  }
  return alongsideTarget(row, sourceId, x, frame);
}

/** Varying block heights still share one top-aligned visual row. */
function measureRows(container: HTMLElement): MeasuredBlock[][] {
  const rows: MeasuredBlock[][] = [];
  for (const element of container.querySelectorAll<HTMLElement>('.guide-block[data-block-id]')) {
    const block = {
      element,
      rect: element.getBoundingClientRect(),
      width: readGuideBlockWidth(element),
    };
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last[0]!.rect.top - block.rect.top) > 2) rows.push([block]);
    else last.push(block);
  }
  return rows;
}

/** Both edges of a gap resolve to one boundary; adjacent isolated-row drops are no-ops. */
function rowBoundaryTarget(
  rows: MeasuredBlock[][],
  boundary: number,
  sourceId: string,
  frame: TargetFrame
): GuideDropTarget | null {
  const sourceRow = rows.findIndex((row) =>
    row.some((entry) => entry.element.dataset['blockId'] === sourceId)
  );
  if (
    sourceRow >= 0 &&
    rows[sourceRow]!.length === 1 &&
    (boundary === sourceRow || boundary === sourceRow + 1)
  )
    return null;
  const following = rows[boundary]?.find((entry) => entry.element.dataset['blockId'] !== sourceId);
  const previous = rows[boundary - 1];
  const anchor =
    following ?? previous?.filter((entry) => entry.element.dataset['blockId'] !== sourceId).at(-1);
  if (!anchor) return null;
  const previousBottom = previous ? rowBottom(previous) : undefined;
  const line = following
    ? previousBottom === undefined
      ? following.rect.top
      : (previousBottom + following.rect.top) / 2
    : previousBottom!;
  return {
    itemId: frame.itemId,
    element: anchor.element,
    placement: following ? 'row-before' : 'row-after',
    anchorBlockId: anchor.element.dataset['blockId']!,
    width: frame.width,
    preview: { left: frame.bounds.left, top: line, width: frame.bounds.width, height: 4 },
  };
}

/** Side placement negotiates one neighboring slot and displays both final widths before commit. */
function alongsideTarget(
  row: MeasuredBlock[],
  sourceId: string,
  x: number,
  frame: TargetFrame
): GuideDropTarget | null {
  const entries = row.filter((block) => block.element.dataset['blockId'] !== sourceId);
  const anchor = entries.reduce((best, next) =>
    horizontalDistance(next.rect, x) < horizontalDistance(best.rect, x) ? next : best
  );
  const after = x > anchor.rect.left + anchor.rect.width / 2;
  const end = x > entries[entries.length - 1]!.rect.right + 8;
  const neighbor = entries.indexOf(anchor);
  const fit = fitGuideRowInsertion(
    entries.map((entry) => entry.width),
    frame.width,
    neighbor
  );
  if (!fit) return null;
  const index = end ? entries.length : neighbor + (after ? 1 : 0);
  const originalIndex = row.findIndex((entry) => entry.element.dataset['blockId'] === sourceId);
  if (originalIndex === index && fit.width === frame.width && fit.neighborWidth === undefined)
    return null;
  const gap = Number.parseFloat(getComputedStyle(anchor.element.parentElement!).columnGap) || 0;
  const pixels = (percent: number) =>
    (frame.bounds.width * percent) / 100 - gap * (1 - percent / 100);
  let left = frame.bounds.left;
  for (let i = 0; i < index; i++) {
    const width =
      i === neighbor && fit.neighborWidth !== undefined ? fit.neighborWidth : entries[i]!.width;
    left += pixels(width) + gap;
  }
  const top = row[0]!.rect.top;
  const height = rowBottom(row) - top;
  const result: GuideDropTarget = {
    itemId: frame.itemId,
    element: anchor.element,
    placement: end ? 'row-end' : after ? 'after' : 'before',
    anchorBlockId: anchor.element.dataset['blockId']!,
    width: fit.width,
    preview: { left, top, width: pixels(fit.width), height },
  };
  if (fit.neighborWidth !== undefined)
    result.neighbor = {
      left: after || end ? anchor.rect.left : left + pixels(fit.width) + gap,
      top,
      width: pixels(fit.neighborWidth),
      height,
      percent: fit.neighborWidth,
    };
  return result;
}
function rowBottom(row: MeasuredBlock[]) {
  return Math.max(...row.map((block) => block.rect.bottom));
}
function rowDistance(row: MeasuredBlock[], y: number) {
  return Math.max(row[0]!.rect.top - y, 0, y - rowBottom(row));
}
function horizontalDistance(rect: DOMRect, x: number) {
  return Math.max(rect.left - x, 0, x - rect.right);
}
/** Read the renderer's bounded percentage without admitting malformed DOM values into previews. */
export function readGuideBlockWidth(element: HTMLElement): number {
  const width = Number(element.dataset['width']);
  return Number.isInteger(width) && width >= GUIDE_LIMITS.minBlockWidthPercent && width <= 100
    ? width
    : 100;
}
