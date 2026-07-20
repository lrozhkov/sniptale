// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRasterMaskBounds: vi.fn(() => ({ left: 1, top: 2, width: 3, height: 4 })),
  resolveRasterOverlayObject: vi.fn(() => ({
    getBoundingRect: () => ({ left: 10, top: 20, width: 40, height: 30 }),
  })),
}));

vi.mock('../raster/selection', async () => ({
  ...(await vi.importActual<typeof import('../raster/selection')>('../raster/selection')),
  getRasterMaskBounds: mocks.getRasterMaskBounds,
}));

vi.mock('../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

import { drawSelectionMask } from './overlay-selection';

function createContext() {
  return {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('editor-controller/raster-tools/overlay-selection', () => {
  it('renders the selection mask and dashed selected bounds through shared overlay primitives', () => {
    const context = createContext();
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = 10;
    maskCanvas.height = 10;

    drawSelectionMask({
      canvas: {} as never,
      context,
      session: {
        brushDraft: null,
        clipboard: null,
        eraserDraft: null,
        gradientDraft: null,
        hoverCursor: null,
        lassoDraft: null,
        marqueeDraft: null,
        overlayListeners: new Set(),
        selection: {
          maskCanvas,
          reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
        },
      },
    });

    expect(context.drawImage).toHaveBeenCalledWith(maskCanvas, 10, 20, 40, 30);
    expect(context.fillRect).toHaveBeenCalledWith(10, 20, 40, 30);
    expect(context.strokeRect).toHaveBeenCalledWith(14, 26, 12, 12);
  });
});
