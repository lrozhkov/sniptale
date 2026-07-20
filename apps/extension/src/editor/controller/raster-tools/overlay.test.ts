// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact overlay proof keeps all transient raster overlays in one rendering matrix */
import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';

const mocks = vi.hoisted(() => ({
  getRasterMaskBounds: vi.fn(() => ({ left: 1, top: 2, width: 3, height: 4 })),
  resolveRasterOverlayObject: vi.fn(() => ({
    getBoundingRect: () => ({ left: 10, top: 20, width: 40, height: 30 }),
  })),
}));

vi.mock('../raster/selection', async () => {
  const actual = await vi.importActual<typeof import('../raster/selection')>('../raster/selection');
  return {
    ...actual,
    getRasterMaskBounds: mocks.getRasterMaskBounds,
  };
});

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

import { renderEditorRasterOverlay } from './overlay';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    transform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('editor-controller/raster-tools/overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState({
      rasterToolSettings: {
        ...useEditorStore.getState().rasterToolSettings,
        brushSize: 18,
        eraserSize: 24,
        gradientFrom: '#112233',
        gradientStops: [
          { color: '#112233', offset: 0 },
          { color: '#99aabb', offset: 0.4, opacity: 0.5 },
          { color: '#ffffff', offset: 1 },
        ],
        gradientTo: '#ffffff',
      },
    } as never);
  });

  it('renders selection, marquee, lasso, gradient, and hover overlay branches', () => {
    const context = createContext();
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = 10;
    maskCanvas.height = 10;

    renderEditorRasterOverlay({
      canvas: {} as never,
      context,
      session: {
        selection: {
          reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
          maskCanvas,
        },
        marqueeDraft: {
          snapshot: {
            bitmap: maskCanvas,
            reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
            sceneBounds: { left: 10, top: 20, width: 40, height: 30 },
          },
          startBitmapPoint: { x: 1, y: 1 },
          currentBitmapPoint: { x: 4, y: 5 },
        },
        lassoDraft: {
          snapshot: {
            bitmap: maskCanvas,
            reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
            sceneBounds: { left: 10, top: 20, width: 40, height: 30 },
          },
          bitmapPoints: [],
          scenePoints: [new Point(1, 2), new Point(3, 4)],
        },
        gradientDraft: {
          currentBitmapPoint: { x: 3, y: 4 },
          snapshot: {
            bitmap: maskCanvas,
            reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
            sceneBounds: { left: 10, top: 20, width: 40, height: 30 },
          },
          startBitmapPoint: { x: 1, y: 2 },
          startScenePoint: new Point(1, 2),
          currentScenePoint: new Point(3, 4),
        },
        clipboard: null,
        brushDraft: null,
        eraserDraft: null,
        hoverCursor: { scenePoint: new Point(5, 6), tool: 'eraser' },
        overlayListeners: new Set(),
      },
      size: { width: 120, height: 80 },
    });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 120, 80);
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalled();
    expect(context.createLinearGradient).toHaveBeenCalled();
    expect(
      (
        context.createLinearGradient as unknown as {
          mock: { results: Array<{ value: { addColorStop: ReturnType<typeof vi.fn> } }> };
        }
      ).mock.results[0]?.value.addColorStop
    ).toHaveBeenCalledWith(0.4, 'rgba(153, 170, 187, 0.15)');
    expect(context.arc).toHaveBeenCalled();
  });

  it('draws scene-space raster overlays through the active canvas viewport transform', () => {
    const context = createContext();

    renderEditorRasterOverlay({
      canvas: { viewportTransform: [2, 0, 0, 2, 12, 16] } as never,
      context,
      session: {
        selection: null,
        marqueeDraft: null,
        lassoDraft: null,
        gradientDraft: null,
        clipboard: null,
        brushDraft: null,
        eraserDraft: null,
        hoverCursor: { scenePoint: new Point(5, 6), tool: 'eraser' },
        overlayListeners: new Set(),
      },
      size: { width: 120, height: 80 },
    });

    expect(context.transform).toHaveBeenCalledWith(2, 0, 0, 2, 12, 16);
    expect(context.arc).toHaveBeenCalledWith(5, 6, 12, 0, Math.PI * 2);
  });

  it('renders an active eraser draft bitmap before commit so strokes are visible while dragging', () => {
    const context = createContext();
    const bitmap = document.createElement('canvas');
    bitmap.width = 24;
    bitmap.height = 16;

    renderEditorRasterOverlay({
      canvas: {} as never,
      context,
      session: {
        selection: null,
        marqueeDraft: null,
        lassoDraft: null,
        gradientDraft: null,
        clipboard: null,
        brushDraft: null,
        eraserDraft: {
          bitmapPoints: [{ x: 4, y: 5 }],
          snapshot: {
            bitmap,
            reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
            sceneBounds: { left: 10, top: 20, width: 48, height: 32 },
          },
        },
        hoverCursor: null,
        overlayListeners: new Set(),
      },
      size: { width: 120, height: 80 },
    });

    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 10, 20, 48, 32);
  });

  it('renders active brush draft previews and brush-sized hover cursors', () => {
    const context = createContext();
    const bitmap = document.createElement('canvas');
    bitmap.width = 24;
    bitmap.height = 16;

    renderEditorRasterOverlay({
      canvas: {} as never,
      context,
      session: {
        selection: null,
        marqueeDraft: null,
        lassoDraft: null,
        gradientDraft: null,
        clipboard: null,
        brushDraft: {
          bitmapPoints: [{ x: 4, y: 5 }],
          changed: true,
          createdTarget: true,
          snapshot: {
            bitmap,
            reference: { kind: 'object', objectId: 'brush-1', objectName: 'Brush 1' },
            sceneBounds: { left: 0, top: 0, width: 24, height: 16 },
          },
        },
        eraserDraft: null,
        hoverCursor: { scenePoint: new Point(5, 6), tool: 'brush' },
        overlayListeners: new Set(),
      },
      size: { width: 120, height: 80 },
    });

    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 24, 16);
    expect(context.arc).toHaveBeenCalledWith(5, 6, 9, 0, Math.PI * 2);
  });

  it('scales scene-space overlays to the css-sized canvas surface', () => {
    const context = createContext();

    renderEditorRasterOverlay({
      canvas: {
        getHeight: () => 50,
        getWidth: () => 100,
        viewportTransform: [1, 0, 0, 1, 0, 0],
      } as never,
      context,
      session: {
        selection: null,
        marqueeDraft: null,
        lassoDraft: null,
        gradientDraft: null,
        clipboard: null,
        brushDraft: null,
        eraserDraft: null,
        hoverCursor: { scenePoint: new Point(20, 10), tool: 'eraser' },
        overlayListeners: new Set(),
      },
      size: { width: 200, height: 100 },
    });

    expect(context.transform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0);
    expect(context.transform).toHaveBeenNthCalledWith(2, 1, 0, 0, 1, 0, 0);
    expect(context.arc).toHaveBeenCalledWith(20, 10, 12, 0, Math.PI * 2);
  });

  it('skips early-return overlay branches when selection geometry is incomplete', () => {
    const context = createContext();
    mocks.resolveRasterOverlayObject.mockReturnValueOnce(null as never);
    mocks.getRasterMaskBounds.mockReturnValueOnce(null as never);

    renderEditorRasterOverlay({
      canvas: {} as never,
      context,
      session: {
        selection: {
          reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
          maskCanvas: document.createElement('canvas'),
        },
        marqueeDraft: null,
        lassoDraft: {
          snapshot: {
            bitmap: document.createElement('canvas'),
            reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
            sceneBounds: { left: 0, top: 0, width: 10, height: 10 },
          },
          bitmapPoints: [],
          scenePoints: [new Point(1, 2)],
        },
        gradientDraft: null,
        clipboard: null,
        brushDraft: null,
        eraserDraft: null,
        hoverCursor: null,
        overlayListeners: new Set(),
      },
      size: { width: 40, height: 30 },
    });

    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.strokeRect).not.toHaveBeenCalled();
    expect(context.arc).not.toHaveBeenCalled();
  });
});
