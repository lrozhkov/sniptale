import { describe, expect, it, vi } from 'vitest';
import { drawOverlayDashedRect, mapBitmapRectToScene } from './overlay-primitives';

function createContext() {
  return {
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('editor-controller/raster-tools/overlay-primitives', () => {
  it('draws the two-pass raster overlay dashed rectangle', () => {
    const context = createContext();

    drawOverlayDashedRect(context, { left: 1, top: 2, width: 3, height: 4 });

    expect(context.setLineDash).toHaveBeenCalledWith([6, 4]);
    expect(context.strokeRect).toHaveBeenCalledTimes(2);
    expect(context.strokeRect).toHaveBeenCalledWith(1, 2, 3, 4);
  });

  it('maps bitmap rectangles into scene bounds', () => {
    expect(
      mapBitmapRectToScene(
        {
          bitmap: { width: 20, height: 10 } as HTMLCanvasElement,
          reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
          sceneBounds: { left: 10, top: 20, width: 200, height: 100 },
        },
        { left: 2, top: 3, width: 4, height: 5 }
      )
    ).toEqual({ left: 30, top: 50, width: 40, height: 50 });
  });
});
