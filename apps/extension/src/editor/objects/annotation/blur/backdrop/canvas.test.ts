// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extendBackdropCanvasEdges, renderBackdropCanvas, type MutableBlurCanvas } from './canvas';

function createMutableCanvas(): MutableBlurCanvas {
  return {
    calcViewportBoundaries: vi.fn(),
    enableRetinaScaling: true,
    getObjects: vi.fn(() => [
      { id: 'lower-visible', visible: true },
      { id: 'lower-hidden', visible: false },
      { id: 'target', visible: true },
    ]),
    height: 100,
    renderCanvas: vi.fn(),
    skipControlsDrawing: false,
    viewportTransform: [2, 0, 0, 2, 10, 20],
    width: 120,
  } as unknown as MutableBlurCanvas;
}

describe('blur backdrop canvas owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders lower visible objects and restores mutable canvas state', () => {
    const canvas = createMutableCanvas();
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const backdropCanvas = { height: 24, width: 34 } as HTMLCanvasElement;

    renderBackdropCanvas({
      backdropCanvas,
      bounds: { height: 20, left: 4, paddedHeight: 24, paddedWidth: 34, top: 6, width: 30 },
      canvas,
      context,
      objectIndex: 2,
    });

    expect(canvas.renderCanvas).toHaveBeenCalledWith(context, [
      { id: 'lower-visible', visible: true },
    ]);
    expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    expect(canvas.enableRetinaScaling).toBe(true);
    expect(canvas.skipControlsDrawing).toBe(false);
  });

  it('extends edge pixels when padded bounds leave the scene', () => {
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const backdropCanvas = { height: 20, width: 30 } as HTMLCanvasElement;

    extendBackdropCanvasEdges({
      backdropCanvas,
      bounds: { height: 10, left: -4, paddedHeight: 20, paddedWidth: 30, top: -3, width: 10 },
      context,
      sceneHeight: 50,
      sceneWidth: 60,
    });

    expect(context.drawImage).toHaveBeenCalledWith(backdropCanvas, 4, 0, 1, 20, 0, 0, 4, 20);
    expect(context.drawImage).toHaveBeenCalledWith(backdropCanvas, 0, 3, 30, 1, 0, 0, 30, 3);
  });
});
