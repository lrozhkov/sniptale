// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extendBackdropCanvasEdges } from './edges';
import { renderBackdropCanvas } from './render';
import { type MutableBlurCanvas } from './state';

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

function registerRenderStateTest() {
  it('keeps render orchestration separate from mutable canvas state restoration', () => {
    const canvas = createMutableCanvas();
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    renderBackdropCanvas({
      backdropCanvas: { height: 24, width: 34 } as HTMLCanvasElement,
      bounds: { height: 20, left: 4, paddedHeight: 24, paddedWidth: 34, top: 6, width: 30 },
      canvas,
      context,
      objectIndex: 2,
    });

    expect(canvas.renderCanvas).toHaveBeenCalledWith(context, [
      { id: 'lower-visible', visible: true },
    ]);
    expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
  });
}

function registerNoPaddingTest() {
  it('skips edge extension when padded bounds match the captured blur area', () => {
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

    renderBackdropCanvas({
      backdropCanvas: { height: 20, width: 30 } as HTMLCanvasElement,
      bounds: { height: 20, left: 4, paddedHeight: 20, paddedWidth: 30, top: 6, width: 30 },
      canvas: createMutableCanvas(),
      context,
      objectIndex: 2,
    });

    expect(context.drawImage).not.toHaveBeenCalled();
  });
}

function registerEdgeExtensionTest() {
  it('keeps padded edge extension in the edge owner', () => {
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
}

describe('blur backdrop canvas role owners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerRenderStateTest();
  registerNoPaddingTest();
  registerEdgeExtensionTest();
});
