import { afterEach, describe, expect, it } from 'vitest';
import { constrainSelection, selectElement } from '.';

const originalWindow = globalThis.window;

function stubWindow(width: number, height: number) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      innerWidth: width,
      innerHeight: height,
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('selection-mode frame selection constraints', () => {
  it('keeps the selection inside the viewport when dragging would overflow', () => {
    stubWindow(500, 400);

    const result = constrainSelection({ x: 460, y: -40, width: 80, height: 90 });

    expect(result).toEqual({ x: 420, y: 0, width: 80, height: 90 });
  });
});

describe('selection-mode frame element selection', () => {
  it('clips selected element dimensions to the current selection bounds', () => {
    stubWindow(500, 400);

    const result = selectElement({
      element: {} as HTMLElement,
      getAbsolutePosition: () => ({ x: 40, y: 50, width: 700, height: 300 }),
      getMaxSelectionWidth: () => 500,
      getMaxSelectionHeight: () => 200,
    });

    expect(result).toEqual({
      currentSelection: { x: 0, y: 50, width: 500, height: 200 },
      aspectRatio: 2.5,
    });
  });

  it('clamps element-based selection coordinates to the visible viewport', () => {
    stubWindow(500, 400);

    const result = selectElement({
      element: {} as HTMLElement,
      getAbsolutePosition: () => ({ x: 460, y: 390, width: 80, height: 90 }),
      getMaxSelectionWidth: () => 500,
      getMaxSelectionHeight: () => 400,
    });

    expect(result.currentSelection).toEqual({ x: 420, y: 310, width: 80, height: 90 });
  });
});
