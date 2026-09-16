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

it('inserts at stable item and block boundaries without changing neighboring content', () => {
  const source = fixture();
  const inserted = applyGuideStructureOperation(source, {
    kind: 'add-step',
    beforeItemId: 'first',
  });
  expect(inserted.items.map((item) => item.id)).toEqual([
    'intro',
    expect.any(String),
    'first',
    'second',
  ]);
  expect(source.items.map((item) => item.id)).toEqual(['intro', 'first', 'second']);
  const withBlock = applyGuideStructureOperation(source, {
    kind: 'add-block',
    itemId: 'first',
    blockKind: 'heading',
    beforeBlockId: 'image',
  });
  const step = withBlock.items[1];
  expect(step?.kind === 'step' && step.blocks.map((block) => block.kind)).toEqual([
    'text',
    'heading',
    'image',
  ]);
  expect(() =>
    applyGuideStructureOperation(source, { kind: 'add-section', beforeItemId: 'missing' })
  ).toThrow();
  expect(() =>
    applyGuideStructureOperation(source, {
      kind: 'add-block',
      itemId: 'first',
      blockKind: 'text',
      beforeBlockId: 'missing',
    })
  ).toThrow();
});

it('inserts an empty image slot at a stable boundary without creating media references', () => {
  const source = fixture();
  const next = applyGuideStructureOperation(source, {
    kind: 'add-block',
    itemId: 'first',
    blockKind: 'image-slot',
    beforeBlockId: 'image',
  });
  const first = next.items.find((item) => item.id === 'first');
  if (first?.kind !== 'step') throw new Error('Missing step');
  expect(first.blocks.map((block) => block.kind)).toEqual(['text', 'image-slot', 'image']);
  expect(first.blocks[1]).toMatchObject({ frame: { width: 960, height: 540 }, fit: 'contain' });
  expect(first.blocks[1]).not.toHaveProperty('assetId');
  expect(source).toEqual(fixture());
});

it('places a canonical project image in another step without acquiring resources', () => {
  const source = fixture();
  const next = applyGuideStructureOperation(source, {
    kind: 'place-image',
    sourceBlockId: 'image',
    itemId: 'second',
  });
  const target = next.items[2];
  if (target?.kind !== 'step') throw new Error('Missing target');
  expect(target.blocks).toHaveLength(2);
  expect(target.blocks[1]).toMatchObject({
    kind: 'image',
    assetId: 'asset',
    editDocumentId: 'annotations',
  });
  expect(target.blocks[1]?.id).not.toBe('image');
  expect(source).toEqual(fixture());
});

it('fills a selected slot preserving its frame, identity and caption', () => {
  const source = applyGuideStructureOperation(fixture(), {
    kind: 'add-block',
    itemId: 'second',
    blockKind: 'image-slot',
  });
  const step = source.items[2];
  if (step?.kind !== 'step') throw new Error('Missing step');
  const slot = step.blocks[1];
  if (slot?.kind !== 'image-slot') throw new Error('Missing slot');
  slot.caption = 'Target caption';
  const next = applyGuideStructureOperation(source, {
    kind: 'place-image',
    sourceBlockId: 'image',
    itemId: 'second',
    blockId: slot.id,
  });
  const target = next.items[2];
  expect(target?.kind === 'step' && target.blocks[1]).toMatchObject({
    kind: 'image',
    id: slot.id,
    frame: slot.frame,
    caption: 'Target caption',
    assetId: 'asset',
  });
  expect(step.blocks[1]?.kind).toBe('image-slot');
});

it('rejects stale image source and non-image replacement targets without changing the project', () => {
  const source = fixture();
  for (const [sourceBlockId, blockId] of [
    ['gone', undefined],
    ['text', undefined],
    ['image', 'note'],
    ['image', 'gone'],
  ]) {
    expect(() =>
      applyGuideStructureOperation(source, {
        kind: 'place-image',
        sourceBlockId: sourceBlockId!,
        itemId: 'second',
        ...(blockId ? { blockId } : {}),
      })
    ).toThrow();
  }
  expect(source).toEqual(fixture());
});

it('replaces only the chosen image at capacity and rejects appending beyond capacity', () => {
  const source = fixture();
  const step = source.items[2];
  if (step?.kind !== 'step') throw new Error('Missing step');
  step.blocks = Array.from({ length: GUIDE_LIMITS.maxBlocksPerStep }, (_, index) =>
    createGuideImageBlock({
      id: `target-${index}`,
      assetId: `old-${index}`,
      width: 320,
      height: 240,
      source: { kind: 'import', filename: 'old.png' },
    })
  );
  const before = structuredClone(source);
  const next = applyGuideStructureOperation(source, {
    kind: 'place-image',
    sourceBlockId: 'image',
    itemId: 'second',
    blockId: 'target-1',
  });
  const target = next.items[2];
  if (target?.kind !== 'step') throw new Error('Missing target');
  expect(target.blocks).toHaveLength(GUIDE_LIMITS.maxBlocksPerStep);
  expect(target.blocks[0]).toEqual(step.blocks[0]);
  expect(target.blocks[1]).toMatchObject({
    id: 'target-1',
    assetId: 'asset',
    frame: { width: 320, height: 240 },
    contentTransform: { x: 0, y: 0, scale: 1 },
  });
  expect(target.blocks[2]).toEqual(step.blocks[2]);
  expect(() =>
    applyGuideStructureOperation(source, {
      kind: 'place-image',
      sourceBlockId: 'image',
      itemId: 'second',
    })
  ).toThrow('limits');
  expect(source).toEqual(before);
});

it('changes block width immutably and retains it through duplication', () => {
  const source = fixture();
  const changed = applyGuideStructureOperation(source, {
    kind: 'set-block-width',
    itemId: 'first',
    blockId: 'text',
    width: 'half',
  });
  const first = changed.items[1];
  if (first?.kind !== 'step') throw new Error('Missing first step');
  expect(first.blocks[0]?.width).toBe('half');
  expect(source).toEqual(fixture());
  const duplicate = applyGuideStructureOperation(changed, {
    kind: 'duplicate-block',
    itemId: 'first',
    blockId: 'text',
  });
  expect(duplicate.items[1]?.kind === 'step' && duplicate.items[1].blocks[1]?.width).toBe('half');
  expect(() =>
    applyGuideStructureOperation(source, {
      kind: 'set-block-width',
      itemId: 'first',
      blockId: 'gone',
      width: 'half',
    })
  ).toThrow();
});

it('image replacement keeps target composition instead of inheriting source width', () => {
  const source = fixture();
  const first = source.items[1];
  if (first?.kind !== 'step') throw new Error('Missing first step');
  const image = first.blocks[1];
  if (image?.kind !== 'image') throw new Error('Missing image');
  image.width = 'half';
  first.blocks.push({ ...image, id: 'target', width: 'full' });
  const operation = {
    kind: 'place-image' as const,
    sourceBlockId: 'image',
    itemId: 'first',
    blockId: 'target',
  };
  let next = applyGuideStructureOperation(source, operation);
  expect(next.items[1]?.kind === 'step' && next.items[1].blocks[2]?.width).toBe('full');
  delete first.blocks[2]!.width;
  next = applyGuideStructureOperation(source, operation);
  expect(next.items[1]?.kind === 'step' && next.items[1].blocks[2]?.width).toBeUndefined();
});

it('reorders existing blocks before a target or to the end without changing their content', () => {
  const source = fixture();
  const first = source.items[1];
  if (first?.kind !== 'step') throw new Error('Missing first');
  first.blocks[1]!.width = 'half';
  const next = applyGuideStructureOperation(source, {
    kind: 'reorder-block',
    itemId: 'first',
    blockId: 'image',
    beforeBlockId: 'text',
  });
  const result = next.items[1];
  if (result?.kind !== 'step') throw new Error('Missing result');
  expect(result.blocks).toEqual([first.blocks[1], first.blocks[0]]);
  expect(first.blocks.map((block) => block.id)).toEqual(['text', 'image']);
  const restored = applyGuideStructureOperation(next, {
    kind: 'reorder-block',
    itemId: 'first',
    blockId: 'image',
  });
  expect(restored).toEqual(source);
  expect(
    applyGuideStructureOperation(source, {
      kind: 'reorder-block',
      itemId: 'first',
      blockId: 'text',
      beforeBlockId: 'text',
    })
  ).toEqual(source);
  expect(() =>
    applyGuideStructureOperation(source, {
      kind: 'reorder-block',
      itemId: 'first',
      blockId: 'image',
      beforeBlockId: 'gone',
    })
  ).toThrow();
  expect(() =>
    applyGuideStructureOperation(source, {
      kind: 'reorder-block',
      itemId: 'first',
      blockId: 'note',
    })
  ).toThrow();
});

it('places a resource into a new step at a stable boundary or at the end without altering its source', () => {
  const project = fixture();
  for (const beforeItemId of ['second', undefined]) {
    const next = applyGuideStructureOperation(project, {
      kind: 'place-image',
      sourceBlockId: 'image',
      ...(beforeItemId === undefined ? {} : { beforeItemId }),
    });
    const inserted = next.items[beforeItemId ? 2 : 3];
    expect(inserted?.kind).toBe('step');
    if (inserted?.kind !== 'step') throw new Error('Missing step');
    expect(inserted.blocks).toHaveLength(1);
    expect(inserted.blocks[0]).toMatchObject({
      kind: 'image',
      assetId: 'asset',
      editDocumentId: 'annotations',
    });
    expect(inserted.blocks[0]?.id).not.toBe('image');
    expect(project.items).toHaveLength(3);
  }
  expect(() =>
    applyGuideStructureOperation(project, {
      kind: 'place-image',
      sourceBlockId: 'image',
      beforeItemId: 'gone',
    })
  ).toThrow();
});

it('keeps exact percentage composition through validation and duplication', () => {
  const project = fixture();
  const next = applyGuideStructureOperation(project, {
    kind: 'set-block-width',
    itemId: 'first',
    blockId: 'image',
    width: 37,
  });
  const duplicate = applyGuideStructureOperation(next, {
    kind: 'duplicate-block',
    itemId: 'first',
    blockId: 'image',
  });
  const item = duplicate.items[1];
  if (item?.kind !== 'step') throw new Error('Missing step');
  expect(item.blocks.filter((block) => block.kind === 'image').map((block) => block.width)).toEqual(
    [37, 37]
  );
  expect(() =>
    applyGuideStructureOperation(project, {
      kind: 'set-block-width',
      itemId: 'first',
      blockId: 'image',
      width: 101,
    })
  ).toThrow();
  expect(project.items[1]?.kind === 'step' && project.items[1].blocks[1]?.width).toBeUndefined();
});

it('keeps template editing within one step and routes canvas images into that step', () => {
  const project = createGuideProject('Template');
  project.purpose = 'step-template';
  const step = createGuideStep('', 'template-step');
  const image = createGuideImageBlock({
    id: 'source-image',
    assetId: 'asset',
    width: 100,
    height: 100,
    source: { kind: 'import', filename: 'image.png' },
  });
  step.blocks = [image];
  project.items = [step];
  const next = applyGuideStructureOperation(project, {
    kind: 'place-image',
    sourceBlockId: image.id,
  });
  expect(next.items).toHaveLength(1);
  expect(next.items[0]).toMatchObject({
    blocks: [
      expect.objectContaining({ assetId: 'asset' }),
      expect.objectContaining({ assetId: 'asset' }),
    ],
  });
  for (const operation of [
    { kind: 'add-step' },
    { kind: 'add-section' },
    { kind: 'remove-item', itemId: step.id },
    { kind: 'duplicate-item', itemId: step.id },
  ] as const) {
    expect(() => applyGuideStructureOperation(project, operation)).toThrow();
  }
  expect(project.items).toHaveLength(1);
  expect(step.blocks).toHaveLength(1);
});

it('transfers a block between steps atomically, retaining its identity and media references', () => {
  const project = fixture();
  const before = structuredClone(project);
  const next = applyGuideStructureOperation(project, {
    kind: 'transfer-block',
    itemId: 'first',
    targetItemId: 'second',
    blockId: 'image',
    beforeBlockId: 'note',
  });
  expect(next.items[1]).toMatchObject({ blocks: [{ id: 'text' }] });
  expect(next.items[2]).toMatchObject({
    blocks: [{ id: 'image', assetId: 'asset', editDocumentId: 'annotations' }, { id: 'note' }],
  });
  expect(project).toEqual(before);
  expect(() =>
    applyGuideStructureOperation(project, {
      kind: 'transfer-block',
      itemId: 'first',
      targetItemId: 'second',
      blockId: 'image',
      beforeBlockId: 'missing',
    })
  ).toThrow();
  expect(project).toEqual(before);
});

it('transfers into an empty step and rejects invalid destinations and capacity overflow', () => {
  const project = fixture();
  const target = project.items[2];
  if (target?.kind !== 'step') throw new Error('Missing step');
  target.blocks = [];
  expect(
    applyGuideStructureOperation(project, {
      kind: 'transfer-block',
      itemId: 'first',
      targetItemId: 'second',
      blockId: 'image',
    }).items[2]
  ).toMatchObject({ blocks: [{ id: 'image' }] });
  for (const targetItemId of ['missing', 'intro'])
    expect(() =>
      applyGuideStructureOperation(project, {
        kind: 'transfer-block',
        itemId: 'first',
        targetItemId,
        blockId: 'image',
      })
    ).toThrow();
  expect(() =>
    applyGuideStructureOperation(project, {
      kind: 'transfer-block',
      itemId: 'first',
      targetItemId: 'second',
      blockId: 'missing',
    })
  ).toThrow();
  target.blocks = Array.from({ length: GUIDE_LIMITS.maxBlocksPerStep }, (_, index) => ({
    kind: 'heading',
    id: `heading-${index}`,
    text: '',
  }));
  const before = structuredClone(project);
  expect(() =>
    applyGuideStructureOperation(project, {
      kind: 'transfer-block',
      itemId: 'first',
      targetItemId: 'second',
      blockId: 'image',
    })
  ).toThrow();
  expect(project).toEqual(before);
});

it('uses in-step ordering when transfer source and destination are the same', () => {
  const next = applyGuideStructureOperation(fixture(), {
    kind: 'transfer-block',
    itemId: 'first',
    targetItemId: 'first',
    blockId: 'image',
    beforeBlockId: 'text',
  });
  expect(next.items[1]).toMatchObject({ blocks: [{ id: 'image' }, { id: 'text' }] });
});
