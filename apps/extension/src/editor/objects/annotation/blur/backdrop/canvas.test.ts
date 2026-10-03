// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extendBackdropCanvasEdges, renderBackdropCanvas, type MutableBlurCanvas } from './canvas';
import { extendTransformedBackdropCanvasEdges } from './canvas/edges';
import { setEditorEditingSurfaceDimensions } from '../../../../document/canvas-surface/editing-surface';

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
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(100);
    expect(canvas.enableRetinaScaling).toBe(true);
    expect(canvas.skipControlsDrawing).toBe(false);
  });

  it('restores mutable canvas state when nested backdrop rendering throws', () => {
    const canvas = createMutableCanvas();
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const failure = new Error('backdrop render failed');
    vi.mocked(canvas.renderCanvas).mockImplementation(() => {
      expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, -4, -6]);
      expect(canvas.width).toBe(34);
      expect(canvas.height).toBe(24);
      expect(canvas.enableRetinaScaling).toBe(false);
      expect(canvas.skipControlsDrawing).toBe(true);
      throw failure;
    });

    expect(() =>
      renderBackdropCanvas({
        backdropCanvas: { height: 24, width: 34 } as HTMLCanvasElement,
        bounds: { height: 20, left: 4, paddedHeight: 24, paddedWidth: 34, top: 6, width: 30 },
        canvas,
        context,
        objectIndex: 2,
      })
    ).toThrow(failure);

    expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(100);
    expect(canvas.enableRetinaScaling).toBe(true);
    expect(canvas.skipControlsDrawing).toBe(false);

    canvas.width = 160;
    vi.mocked(canvas.renderCanvas).mockReset();
    renderBackdropCanvas({
      backdropCanvas: { height: 20, width: 40 } as HTMLCanvasElement,
      bounds: { height: 10, left: 140, paddedHeight: 20, paddedWidth: 40, top: 0, width: 30 },
      canvas,
      context,
      objectIndex: 2,
    });
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 19, 0, 1, 20, 20, 0, 20, 20);
  });

  it('renders prior blur layers through the live scaled capture transform', () => {
    const canvas = createMutableCanvas();
    const lowerBlur = { id: 'lower-blur', visible: true };
    vi.mocked(canvas.getObjects).mockReturnValue([
      { id: 'source', visible: true },
      lowerBlur,
      { id: 'target', visible: true },
    ] as never);
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.mocked(canvas.renderCanvas).mockImplementation(() => {
      expect(canvas.viewportTransform).toEqual([0.5, 0, 0, 1 / 3, 1, 2]);
    });

    renderBackdropCanvas({
      backdropCanvas: { height: 32, width: 52 } as HTMLCanvasElement,
      bounds: {
        height: 20,
        left: 4,
        paddedHeight: 32,
        paddedWidth: 52,
        top: 6,
        viewportTransform: [0.5, 0, 0, 1 / 3, 1, 2],
        width: 40,
      },
      canvas,
      context,
      objectIndex: 2,
    });

    expect(canvas.renderCanvas).toHaveBeenCalledWith(context, [
      { id: 'source', visible: true },
      lowerBlur,
    ]);
    expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 10, 20]);
  });

  it('uses the full scene edge while capturing a blur nested inside another blur', () => {
    const canvas = createMutableCanvas();
    const outerContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const innerContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const innerBackdrop = { height: 20, width: 40 } as HTMLCanvasElement;
    vi.mocked(canvas.renderCanvas).mockImplementationOnce(() => {
      renderBackdropCanvas({
        backdropCanvas: innerBackdrop,
        bounds: { height: 10, left: 100, paddedHeight: 20, paddedWidth: 40, top: 0, width: 30 },
        canvas,
        context: innerContext,
        objectIndex: 2,
      });
    });

    renderBackdropCanvas({
      backdropCanvas: { height: 24, width: 34 } as HTMLCanvasElement,
      bounds: { height: 20, left: 4, paddedHeight: 24, paddedWidth: 34, top: 6, width: 30 },
      canvas,
      context: outerContext,
      objectIndex: 2,
    });

    expect(innerContext.drawImage).toHaveBeenCalledWith(innerBackdrop, 19, 0, 1, 20, 20, 0, 20, 20);
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(100);
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

  it('fills rotated capture padding from the nearest in-scene edge pixel', () => {
    const width = 12;
    const height = 12;
    const data = new Uint8ClampedArray(width * height * 4);
    data.set([200, 10, 20, 255], (5 * width + 5) * 4);
    const imageData = { data, height, width } as ImageData;
    const context = {
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    extendTransformedBackdropCanvasEdges({
      backdropCanvas: { height, width } as HTMLCanvasElement,
      context,
      sceneHeight: 6,
      sceneWidth: 6,
      viewportTransform: [0, 1, -1, 0, 10, 0],
    });

    expect(Array.from(data.slice((9 * width + 5) * 4, (9 * width + 5) * 4 + 4))).toEqual([
      200, 10, 20, 255,
    ]);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
  });
});

describe('blur sampling at the document edge inside an editing workspace', () => {
  it.each([
    ['bottom', { left: 20, top: 70 }, [0, 29, 40, 1, 0, 30, 40, 10]],
    ['right', { left: 90, top: 20 }, [29, 0, 1, 40, 30, 0, 10, 40]],
  ] as const)(
    'extends the %s document edge rather than the padded workspace edge',
    (_edge, origin, sample) => {
      const canvas = createMutableCanvas();
      canvas.setDimensions = vi.fn(function (size) {
        canvas.width = Number(size.width);
        canvas.height = Number(size.height);
        return canvas;
      });
      canvas.setViewportTransform = vi.fn((transform) => {
        canvas.viewportTransform = transform;
      });
      setEditorEditingSurfaceDimensions(canvas, { width: 120, height: 100 });
      const workspaceSize = { width: canvas.width, height: canvas.height };
      expect(workspaceSize.height).toBeGreaterThan(100);
      const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
      const backdropCanvas = { height: 40, width: 40 } as HTMLCanvasElement;
      renderBackdropCanvas({
        backdropCanvas,
        bounds: { ...origin, width: 20, height: 20, paddedWidth: 40, paddedHeight: 40 },
        canvas,
        context,
        objectIndex: 2,
      });
      expect(context.drawImage).toHaveBeenCalledWith(backdropCanvas, ...sample);
      expect({ width: canvas.width, height: canvas.height }).toEqual(workspaceSize);
    }
  );
});
