import {
  GUIDE_LIMITS,
  type GuideBlock,
  type GuideProject,
  type GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideBlockWidth, resolveGuideRows } from './layout';

/** A spatial destination identifies content, never persisted browser coordinates. */
export type GuideBlockPlacement = {
  kind: 'place-block';
  itemId: string;
  targetItemId: string;
  blockId: string;
  anchorBlockId?: string;
  placement: 'row-before' | 'row-after' | 'before' | 'after' | 'row-end';
};

/** Preview and commit negotiate only the neighboring slot when the original width cannot fit. */
export function fitGuideRowInsertion(widths: readonly number[], width: number, neighbor: number) {
  if (widths.reduce((sum, value) => sum + value, 0) + width <= 100) return { width };
  const slot = widths[neighbor];
  if (slot === undefined || slot < 2 * GUIDE_LIMITS.minBlockWidthPercent) return null;
  const split = Math.floor(slot / 2);
  return { width: split, neighborWidth: slot - split };
}

function requireStep(project: GuideProject, id: string): GuideStep {
  const step = project.items.find((item) => item.id === id);
  if (step?.kind !== 'step') throw new Error('Guide step is unavailable.');
  return step;
}

/** Commits one placement on a detached project; the caller validates the complete transaction. */
export function placeGuideBlock(project: GuideProject, operation: GuideBlockPlacement): void {
  const source = requireStep(project, operation.itemId);
  const target = requireStep(project, operation.targetItemId);
  const block = source.blocks.find((entry) => entry.id === operation.blockId);
  if (!block || operation.anchorBlockId === block.id)
    throw new Error('Guide placement is unavailable.');
  const sourceRows = resolveGuideRows(source);
  const targetRows = source === target ? sourceRows : resolveGuideRows(target);
  const rowIndex = operation.anchorBlockId
    ? targetRows.findIndex((row) => row.some((entry) => entry.id === operation.anchorBlockId))
    : targetRows.length;
  if (rowIndex < 0) throw new Error('Guide placement target is unavailable.');
  const targetRow = targetRows[rowIndex];
  const width = resolveGuideBlockWidth(source.layout, block);
  const pinned = new Set<GuideBlock[]>();
  for (const [index, row] of sourceRows.entries()) {
    const position = row.indexOf(block);
    if (position < 0) continue;
    pinned.add(row);
    const following = sourceRows[index + 1];
    if (following) pinned.add(following);
    row.splice(position, 1);
  }
  const isNewRow = operation.placement === 'row-before' || operation.placement === 'row-after';
  if (isNewRow || !targetRow) {
    const index = rowIndex + (targetRow && operation.placement === 'row-after' ? 1 : 0);
    const inserted = [block];
    pinned.add(inserted);
    const following = targetRows[index];
    if (following) pinned.add(following);
    targetRows.splice(index, 0, inserted);
    block.width = width;
  } else {
    const neighbor = targetRow.findIndex((entry) => entry.id === operation.anchorBlockId);
    const fit = fitGuideRowInsertion(
      targetRow.map((entry) => resolveGuideBlockWidth(target.layout, entry)),
      width,
      neighbor
    );
    if (!fit) throw new Error('Guide row has no available space.');
    block.width = fit.width;
    if (fit.neighborWidth !== undefined && targetRow[neighbor])
      targetRow[neighbor]!.width = fit.neighborWidth;
    const index =
      operation.placement === 'row-end'
        ? targetRow.length
        : neighbor + (operation.placement === 'after' ? 1 : 0);
    targetRow.splice(index, 0, block);
    pinned.add(targetRow);
  }
  source.blocks = flattenRows(sourceRows, pinned);
  if (source !== target) target.blocks = flattenRows(targetRows, pinned);
}

/** Preserve only the edited edges; distant rows retain their authored or automatic behavior. */
function flattenRows(rows: GuideBlock[][], pinned: ReadonlySet<GuideBlock[]>): GuideBlock[] {
  return rows
    .filter((row) => row.length)
    .flatMap((row) =>
      pinned.has(row) ? row.map((block, index) => ({ ...block, rowStart: index === 0 })) : row
    );
}
