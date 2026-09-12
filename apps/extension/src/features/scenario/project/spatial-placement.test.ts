import { expect, it } from 'vitest';
import { createGuideProject, createGuideStep } from './factories';
import { applyGuideStructureOperation } from './mutations';
import { resolveGuideRows } from './layout';
import { fitGuideRowInsertion, type GuideBlockPlacement } from './spatial-placement';
import type { GuideProject, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';

function fixture() {
  const project = createGuideProject('Rows');
  const source = createGuideStep('Source', 'source');
  source.blocks = [
    { kind: 'heading', id: 'a', text: 'A', width: 30 },
    { kind: 'heading', id: 'b', text: 'B', width: 40, rowStart: true },
    { kind: 'heading', id: 'c', text: 'C', width: 30 },
  ];
  const target = createGuideStep('Target', 'target');
  target.blocks = [
    { kind: 'heading', id: 'd', text: 'D', width: 100 },
    { kind: 'heading', id: 'e', text: 'E', width: 20, rowStart: true },
  ];
  project.items = [source, target];
  return project;
}
function rows(project: GuideProject, index = 0) {
  return resolveGuideRows(project.items[index] as GuideStep).map((row) =>
    row.map((block) => [block.id, block.width])
  );
}
const base: GuideBlockPlacement = {
  kind: 'place-block',
  itemId: 'source',
  targetItemId: 'target',
  blockId: 'b',
  anchorBlockId: 'd',
  placement: 'after',
};
it('splits only the hovered slot, preserves source and unrelated rows, and leaves the input for Undo', () => {
  const original = fixture();
  const snapshot = structuredClone(original);
  const next = applyGuideStructureOperation(original, base);
  expect(rows(next)).toEqual([[['a', 30]], [['c', 30]]]);
  expect(rows(next, 1)).toEqual([
    [
      ['d', 50],
      ['b', 50],
    ],
    [['e', 20]],
  ]);
  expect(original).toEqual(snapshot);
});
it('places above/below and into remaining row space with the original width', () => {
  const before = applyGuideStructureOperation(fixture(), { ...base, placement: 'row-before' });
  expect(rows(before, 1)).toEqual([[['b', 40]], [['d', 100]], [['e', 20]]]);
  const after = applyGuideStructureOperation(fixture(), { ...base, placement: 'row-after' });
  expect(rows(after, 1)).toEqual([[['d', 100]], [['b', 40]], [['e', 20]]]);
  const end = applyGuideStructureOperation(fixture(), {
    ...base,
    anchorBlockId: 'e',
    placement: 'row-end',
  });
  expect(rows(end, 1)).toEqual([
    [['d', 100]],
    [
      ['e', 20],
      ['b', 40],
    ],
  ]);
});
it('moves within one step atomically without collapsing the source row', () => {
  const next = applyGuideStructureOperation(fixture(), {
    ...base,
    targetItemId: 'source',
    anchorBlockId: 'a',
    placement: 'before',
  });
  expect(rows(next)).toEqual([
    [
      ['b', 40],
      ['a', 30],
    ],
    [['c', 30]],
  ]);
});
it('supports an empty destination and refuses stale anchors without losing source content', () => {
  const original = fixture();
  (original.items[1] as GuideStep).blocks = [];
  expect(
    rows(
      applyGuideStructureOperation(original, {
        kind: 'place-block',
        itemId: 'source',
        targetItemId: 'target',
        blockId: 'b',
        placement: 'row-before',
      }),
      1
    )
  ).toEqual([[['b', 40]]]);
  const snapshot = structuredClone(original);
  expect(() => applyGuideStructureOperation(original, base)).toThrow();
  expect(original).toEqual(snapshot);
});
it('does not squeeze below the supported minimum or redistribute unrelated neighbors', () => {
  expect(fitGuideRowInsertion([20, 20, 20, 20, 20], 20, 1)).toBeNull();
  expect(fitGuideRowInsertion([40, 40, 20], 100, 0)).toEqual({ width: 20, neighborWidth: 20 });
  expect(fitGuideRowInsertion([30, 30], 40, 0)).toEqual({ width: 40 });
});
it('transfers a local boundary when removing its first block and permits local auto packing', () => {
  const project = fixture();
  const removed = applyGuideStructureOperation(project, {
    kind: 'remove-block',
    itemId: 'source',
    blockId: 'b',
  });
  expect(rows(removed)).toEqual([[['a', 30]], [['c', 30]]]);
  const joined = applyGuideStructureOperation(removed, {
    kind: 'set-row-start',
    itemId: 'source',
    blockId: 'c',
    rowStart: false,
  });
  expect(rows(joined)).toEqual([
    [
      ['a', 30],
      ['c', 30],
    ],
  ]);
});

it('does not turn untouched automatic rows into permanent authored breaks', () => {
  const original = fixture();
  const target = original.items[1] as GuideStep;
  target.blocks.push(
    { kind: 'heading', id: 'f', text: 'F', width: 100 },
    { kind: 'heading', id: 'g', text: 'G', width: 100 }
  );
  const next = applyGuideStructureOperation(original, base);
  const blocks = (next.items[1] as GuideStep).blocks;
  expect(blocks.find((block) => block.id === 'f')?.rowStart).toBeUndefined();
  expect(blocks.find((block) => block.id === 'g')?.rowStart).toBeUndefined();
});
