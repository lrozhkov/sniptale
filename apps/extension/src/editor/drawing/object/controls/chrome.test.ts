import { FabricObject } from 'fabric';
import { expect, it } from 'vitest';
import { applyDrawingSelectionChrome, createDrawingRotationControl } from './chrome';

it('applies the content drawing selection chrome', () => {
  const object = new FabricObject();

  applyDrawingSelectionChrome(object);

  expect(object.borderColor).toBe('#2563eb');
  expect(object.borderDashArray).toEqual([4, 3]);
  expect(object.cornerColor).toBe('#ffffff');
  expect(object.transparentCorners).toBe(false);
});

it('uses the canonical rotation cursor', () => {
  expect(createDrawingRotationControl().cursorStyle).toBe('grab');
});
