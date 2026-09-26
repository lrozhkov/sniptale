import { FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';
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

it('shows grabbing on rotation press and leaves locked rotation unavailable', () => {
  const cursor = vi.fn();
  const object = new FabricObject();
  object.canvas = { setCursor: cursor } as never;
  const control = createDrawingRotationControl();
  control.mouseDownHandler?.({} as never, { target: object } as never, 0, 0);
  expect(cursor).toHaveBeenCalledWith('grabbing');
  object.lockRotation = true;
  cursor.mockClear();
  control.mouseDownHandler?.({} as never, { target: object } as never, 0, 0);
  expect(cursor).not.toHaveBeenCalled();
});

it('keeps the rotation handle clear of the corner handle at 400% zoom', () => {
  const rotate = createDrawingRotationControl();
  const minimumCenterDistance = 11.25 + 1.25 + 8.125 + 0.8 + 4;

  expect(rotate.x).toBe(0.5);
  expect(rotate.y).toBe(-0.5);
  expect(Math.hypot(rotate.offsetX, rotate.offsetY)).toBeGreaterThan(minimumCenterDistance);
});
