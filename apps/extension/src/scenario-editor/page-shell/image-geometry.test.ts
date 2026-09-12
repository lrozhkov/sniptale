import { expect, it } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';
import {
  changeGuideImageGeometry,
  moveGuideImageGesture,
  commitGuideImageGesture,
} from './image-geometry';
const block = createGuideImageBlock({
  id: 'image',
  assetId: 'asset',
  editDocumentId: 'annotations',
  width: 800,
  height: 600,
  source: { kind: 'import', filename: 'image.png' },
});
it('converts display movement into stable frame fractions and preserves resource identity', () => {
  const moved = moveGuideImageGesture(block, 'pan', 40, -30, 400, 300);
  expect(moved.contentTransform).toEqual({ x: 0.1, y: -0.1, scale: 1 });
  expect(moved.assetId).toBe('asset');
  expect(moved.editDocumentId).toBe('annotations');
  expect(block.contentTransform).toEqual({ x: 0, y: 0, scale: 1 });
});
it('resizes logical dimensions consistently at different display scales', () => {
  expect(moveGuideImageGesture(block, 'resize', 40, 30, 400, 300).frame.width).toBeCloseTo(880);
  expect(moveGuideImageGesture(block, 'resize', 40, 30, 400, 300).frame.height).toBeCloseTo(660);
  expect(moveGuideImageGesture(block, 'resize', 80, 60, 800, 600).frame).toEqual(
    moveGuideImageGesture(block, 'resize', 40, 30, 400, 300).frame
  );
  expect(moveGuideImageGesture(block, 'pan', 5, 5, 0, 0)).toBe(block);
});
it('bounds geometry, rejects nonfinite input and resets to the original image ratio', () => {
  expect(
    changeGuideImageGeometry(block, { kind: 'zoom', scale: 1000 }).contentTransform.scale
  ).toBe(100);
  expect(
    changeGuideImageGeometry(block, { kind: 'frame', width: -4, height: 10000 }).frame
  ).toEqual({ width: 1, height: 7680 });
  expect(() => changeGuideImageGeometry(block, { kind: 'pan', x: NaN, y: 0 })).toThrow();
  const reset = changeGuideImageGeometry(block, { kind: 'reset', width: 16000, height: 8000 });
  expect(reset.frame).toEqual({ width: 7680, height: 3840 });
  expect(changeGuideImageGeometry(block, { kind: 'fit', fit: 'cover' }).fit).toBe('cover');
});

it('commits only geometry into the current content and omits no-op history', () => {
  const current = { ...structuredClone(block), caption: 'New caption', alt: 'New description' };
  const draft = moveGuideImageGesture(block, 'pan', 40, 30, 400, 300);
  expect(commitGuideImageGesture(current, block, draft)).toEqual({
    ...current,
    contentTransform: { x: 0.1, y: 0.1, scale: 1 },
  });
  expect(commitGuideImageGesture(current, block, structuredClone(block))).toBe(current);
  expect(current.contentTransform.x).toBe(0);
});
it('rejects geometry drafts whose source or display mapping has changed', () => {
  const draft = moveGuideImageGesture(block, 'resize', 40, 30, 400, 300);
  const replacements = [
    { ...block, id: 'other' },
    { ...block, assetId: 'new-image' },
    { ...block, editDocumentId: 'new-annotations' },
    { ...block, width: 'half' as const },
    { ...block, fit: 'cover' as const },
    { ...block, frame: { width: 500, height: 600 } },
    { ...block, contentTransform: { ...block.contentTransform, scale: 2 } },
  ];
  for (const current of replacements)
    expect(commitGuideImageGesture(current, block, draft)).toBeNull();
});

it('constrains oversized axes at both edges and centers underfilled axes for contain and cover', async () => {
  const { constrainGuideImage } = await import('./image-geometry');
  const moved = {
    ...block,
    frame: { width: 400, height: 400 },
    contentTransform: { x: 10, y: -10, scale: 1 },
  };
  expect(
    constrainGuideImage({ ...moved, fit: 'cover' }, { width: 800, height: 400 }).contentTransform
  ).toEqual({ x: 0.5, y: 0, scale: 1 });
  expect(
    constrainGuideImage({ ...moved, fit: 'contain' }, { width: 800, height: 400 }).contentTransform
  ).toEqual({ x: 0, y: 0, scale: 1 });
  expect(
    constrainGuideImage(
      { ...moved, fit: 'contain', contentTransform: { x: -10, y: 10, scale: 4 } },
      { width: 800, height: 400 }
    ).contentTransform
  ).toEqual({ x: -1.5, y: 0.5, scale: 4 });
  const centered = constrainGuideImage(
    { ...moved, contentTransform: { x: -10, y: 10, scale: 0.5 } },
    { width: 800, height: 400 }
  );
  expect(centered.contentTransform).toEqual({ x: 0, y: 0, scale: 0.5 });
  expect(centered.assetId).toBe(block.assetId);
  expect(centered.source).toBe(block.source);
});
