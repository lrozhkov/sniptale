import { expect, it } from 'vitest';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from './factories';
import { applyGuideStructureOperation } from './mutations';

function fixture() {
  const project = createGuideProject('Guide', 'guide', 1);
  const first = createGuideStep('First', 'first');
  first.blocks = [
    { kind: 'text', id: 'text', paragraphs: createGuideParagraphs('Keep this') },
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      editDocumentId: 'annotations',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'image.png' },
    }),
  ];
  const second = createGuideStep('Next title', 'second');
  second.blocks = [
    { kind: 'note', id: 'note', tone: 'info', paragraphs: createGuideParagraphs('Keep note') },
  ];
  project.items = [
    { kind: 'section', id: 'intro', title: 'Introduction', paragraphs: [] },
    first,
    second,
  ];
  return project;
}

it('duplicates a step with new structural identities and unchanged immutable media references', () => {
  const source = fixture();
  const before = structuredClone(source);
  const next = applyGuideStructureOperation(source, { kind: 'duplicate-item', itemId: 'first' });
  const copy = next.items[2];
  expect(copy?.kind).toBe('step');
  if (copy?.kind !== 'step') throw new Error('Missing copy');
  expect(copy.id).not.toBe('first');
  expect(copy.blocks.map((block) => block.id)).not.toContain('image');
  expect(copy.blocks[1]).toMatchObject({
    kind: 'image',
    assetId: 'asset',
    editDocumentId: 'annotations',
    source: { kind: 'import', filename: 'image.png' },
  });
  expect(source).toEqual(before);
});

it('reorders sections and steps and removes only the requested item', () => {
  const moved = applyGuideStructureOperation(fixture(), {
    kind: 'move-item',
    itemId: 'second',
    direction: -1,
  });
  expect(moved.items.map((item) => item.id)).toEqual(['intro', 'second', 'first']);
  const removed = applyGuideStructureOperation(moved, { kind: 'remove-item', itemId: 'intro' });
  expect(removed.items.map((item) => item.id)).toEqual(['second', 'first']);
});

it('merges without dropping the second title and splits ordered content without duplicating image refs', () => {
  const merged = applyGuideStructureOperation(fixture(), { kind: 'merge-next', itemId: 'first' });
  const step = merged.items[1];
  if (step?.kind !== 'step') throw new Error('Missing merged step');
  expect(step.blocks.map((block) => block.kind)).toEqual(['text', 'image', 'heading', 'note']);
  expect(step.blocks[2]).toMatchObject({ text: 'Next title' });
  const split = applyGuideStructureOperation(merged, {
    kind: 'split-step',
    itemId: 'first',
    blockId: 'image',
  });
  const following = split.items[2];
  if (following?.kind !== 'step') throw new Error('Missing split step');
  expect(following.blocks.map((block) => block.kind)).toEqual(['image', 'heading', 'note']);
  expect(following.blocks[0]).toMatchObject({
    id: 'image',
    assetId: 'asset',
    editDocumentId: 'annotations',
  });
});

it('adds optional blocks and supports image block copy, move and removal', () => {
  let next = applyGuideStructureOperation(fixture(), {
    kind: 'add-block',
    itemId: 'first',
    blockKind: 'heading',
  });
  next = applyGuideStructureOperation(next, {
    kind: 'duplicate-block',
    itemId: 'first',
    blockId: 'image',
  });
  next = applyGuideStructureOperation(next, {
    kind: 'move-block',
    itemId: 'first',
    blockId: 'image',
    direction: -1,
  });
  next = applyGuideStructureOperation(next, {
    kind: 'remove-block',
    itemId: 'first',
    blockId: 'text',
  });
  const step = next.items[1];
  if (step?.kind !== 'step') throw new Error('Missing step');
  expect(step.blocks.map((block) => block.kind)).toEqual(['image', 'image', 'heading']);
  expect(new Set(step.blocks.map((block) => block.id)).size).toBe(3);
});

it('creates empty optional steps and unnumbered sections', () => {
  const project = applyGuideStructureOperation(createGuideProject('Empty'), {
    kind: 'add-section',
  });
  const next = applyGuideStructureOperation(project, { kind: 'add-step' });
  expect(next.items[0]).toMatchObject({ kind: 'section', title: '' });
  expect(next.items[1]).toMatchObject({ kind: 'step', title: '', showNumber: true, blocks: [] });
});

it('rejects missing targets, invalid boundaries and crossing a section while preserving input', () => {
  const source = fixture();
  const before = structuredClone(source);
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'remove-block', itemId: 'first', blockId: 'gone' })
  ).toThrow();
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'move-item', itemId: 'gone', direction: 1 })
  ).toThrow();
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'move-item', itemId: 'intro', direction: -1 })
  ).toThrow();
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'split-step', itemId: 'first', blockId: 'text' })
  ).toThrow();
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'merge-next', itemId: 'intro' })
  ).toThrow();
  expect(source).toEqual(before);
});

it('rejects a block limit overflow without changing the source project', () => {
  const source = fixture();
  const step = source.items[1];
  if (step?.kind !== 'step') throw new Error('Missing step');
  step.blocks = Array.from({ length: GUIDE_LIMITS.maxBlocksPerStep }, (_, index) => ({
    kind: 'heading',
    id: `heading-${index}`,
    text: '',
  }));
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'add-block', itemId: 'first', blockKind: 'text' })
  ).toThrow('limits');
  expect(step.blocks).toHaveLength(GUIDE_LIMITS.maxBlocksPerStep);
});
