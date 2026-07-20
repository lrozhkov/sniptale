import { describe, expect, it, vi } from 'vitest';
import { applySceneToOverlayTransform } from './overlay-transform';

describe('editor-controller/raster-tools/overlay-transform', () => {
  it('applies css-to-logical scaling before the active viewport transform', () => {
    const context = { transform: vi.fn() } as unknown as CanvasRenderingContext2D;

    applySceneToOverlayTransform({
      canvas: {
        getHeight: () => 50,
        getWidth: () => 100,
        viewportTransform: [2, 0, 0, 2, 12, 16],
      } as never,
      context,
      size: { width: 200, height: 100 },
    });

    expect(context.transform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0);
    expect(context.transform).toHaveBeenNthCalledWith(2, 2, 0, 0, 2, 12, 16);
  });

  it('skips invalid logical canvas sizes without dropping viewport transforms', () => {
    const context = { transform: vi.fn() } as unknown as CanvasRenderingContext2D;

    applySceneToOverlayTransform({
      canvas: {
        getHeight: () => 0,
        getWidth: () => Number.NaN,
        viewportTransform: [1, 0, 0, 1, 3, 4],
      } as never,
      context,
      size: { width: 200, height: 100 },
    });

    expect(context.transform).toHaveBeenCalledTimes(1);
    expect(context.transform).toHaveBeenCalledWith(1, 0, 0, 1, 3, 4);
  });
});
