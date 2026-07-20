// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { getEditorBuiltInShapeEntry } from '../../../features/editor/document/rich-shape';
import {
  createRichShapeCatalogObject,
  normalizeScaledRichShapeObject,
  resizeRichShapeObjectToBounds,
} from './';

function createRectangleObject() {
  const entry = getEditorBuiltInShapeEntry('rectangle');
  if (!entry) {
    throw new Error('Missing rectangle entry');
  }
  return createRichShapeCatalogObject({
    entry,
    id: 'resized',
    labelIndex: 1,
    left: 10,
    top: 20,
  });
}

it('normalizes resize handles into the rich shape frame model', () => {
  const object = createRectangleObject();
  object.set({ scaleX: 2, scaleY: 0.5 });

  expect(normalizeScaledRichShapeObject({ sniptaleType: 'rectangle' } as never)).toBe(false);
  expect(normalizeScaledRichShapeObject(object)).toBe(true);
  expect(object.scaleX).toBe(1);
  expect(object.scaleY).toBe(1);

  expect(resizeRichShapeObjectToBounds(object, { height: 0, left: 3, top: 4, width: 0 })).toBe(
    true
  );
  expect(object.sniptaleRichShape.frame).toEqual({ height: 1, left: 3, top: 4, width: 1 });
});

it('normalizes rotated rich-shape resize from local dimensions instead of axis-aligned bounds', () => {
  const object = createRectangleObject();
  const width = Number(object.width);
  const height = Number(object.height);
  object.set({ angle: 35, scaleX: 1.5, scaleY: 0.5 });
  object.setCoords();

  expect(normalizeScaledRichShapeObject(object)).toBe(true);

  expect(object.sniptaleRichShape.rotation).toBe(35);
  expect(object.sniptaleRichShape.frame.width).toBeCloseTo(width * 1.5, 6);
  expect(object.sniptaleRichShape.frame.height).toBeCloseTo(height * 0.5, 6);
  expect(object.sniptaleRichShape.frame.width).not.toBeCloseTo(object.getBoundingRect().width, 6);
});

it('falls back to stored rich-shape dimensions for invalid Fabric transform values', () => {
  const object = createRectangleObject();
  const frame = { ...object.sniptaleRichShape.frame };
  object.height = Number.NaN;
  object.left = Number.NaN;
  object.scaleX = 0;
  object.scaleY = Number.NaN;

  expect(normalizeScaledRichShapeObject(object)).toBe(true);

  expect(object.sniptaleRichShape.frame).toMatchObject({
    height: frame.height,
    left: frame.left,
    width: frame.width,
  });
});

it('ignores unchanged scale and non-rich resize targets', () => {
  const object = createRectangleObject();

  expect(normalizeScaledRichShapeObject(object)).toBe(false);
  expect(
    resizeRichShapeObjectToBounds({ sniptaleType: 'rectangle' } as never, {
      height: 1,
      left: 0,
      top: 0,
      width: 1,
    })
  ).toBe(false);
});
