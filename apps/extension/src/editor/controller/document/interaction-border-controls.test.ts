import { Control } from 'fabric';
import { expect, it, vi } from 'vitest';
import { patchEdgeControl } from './interaction-border-controls';

it('keeps the hidden edge resize hit band in screen pixels at high and low zoom', () => {
  let zoom = 4;
  const control = new Control();
  patchEdgeControl(control, 'mt');
  const object = {
    canvas: {
      getActiveObject: () => object,
      get viewportTransform() {
        return [zoom, 0, 0, zoom, 0, 0];
      },
    },
    getCoords: () => [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 0, y: 100 },
    ],
    isControlVisible: vi.fn(() => true),
  };

  expect(
    control.shouldActivate?.('mt', object as never, { x: 600, y: 30 } as never, {} as never)
  ).toBe(false);
  expect(
    control.shouldActivate?.('mt', object as never, { x: 600, y: 5 } as never, {} as never)
  ).toBe(true);
  zoom = 0.2;
  expect(
    control.shouldActivate?.('mt', object as never, { x: 30, y: 6 } as never, {} as never)
  ).toBe(true);
});

it('only activates a visible edge on the selected object and handles a detached object', () => {
  const control = new Control();
  patchEdgeControl(control, 'mr');
  const object = {
    canvas: null as null | {
      getActiveObject: () => unknown;
      viewportTransform: [number, number, number, number, number, number];
    },
    getCoords: () => [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    isControlVisible: vi.fn(() => true),
  };
  const hit = () =>
    control.shouldActivate?.('mr', object as never, { x: 100, y: 50 } as never, {} as never);

  expect(hit()).toBe(false);
  object.canvas = { getActiveObject: () => null, viewportTransform: [1, 0, 0, 1, 0, 0] };
  expect(hit()).toBe(false);
  object.canvas.getActiveObject = () => object;
  object.isControlVisible.mockReturnValue(false);
  expect(hit()).toBe(false);
  object.isControlVisible.mockReturnValue(true);
  expect(hit()).toBe(true);
});
