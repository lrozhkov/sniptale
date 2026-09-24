import { Control } from 'fabric';
import { expect, it, vi } from 'vitest';
import { patchEdgeControl } from './interaction-border-controls';

it('keeps the hidden edge resize hit band in screen pixels at high and low zoom', () => {
  let displayedWidth = 1600;
  const control = new Control();
  patchEdgeControl(control, 'mt');
  const object = {
    canvas: {
      getActiveObject: () => object,
      getWidth: () => 400,
      upperCanvasEl: { getBoundingClientRect: () => ({ width: displayedWidth }) },
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
    control.shouldActivate?.('mt', object as never, { x: 150, y: 5 } as never, {} as never)
  ).toBe(false);
  displayedWidth = 80;
  expect(
    control.shouldActivate?.('mt', object as never, { x: 150, y: 30 } as never, {} as never)
  ).toBe(true);
});
