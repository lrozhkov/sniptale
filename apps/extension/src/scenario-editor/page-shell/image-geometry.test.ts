import { expect, it } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';
import { changeGuideImageGeometry, moveGuideImageGesture } from './image-geometry';
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
