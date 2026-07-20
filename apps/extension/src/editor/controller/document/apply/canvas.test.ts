import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoom: vi.fn(),
}));

vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoom,
}));

import {
  maskCanvasElementDuringLoad,
  prepareCanvasForDocumentLoad,
  renderCanvasAfterDocumentLoad,
} from './canvas';

function registerPrepareCanvasTest() {
  it('prepares canvas dimensions and viewport zoom for document load', () => {
    const canvas = {
      backgroundColor: 'black',
      backgroundImage: 'image',
      setDimensions: vi.fn(),
      setZoom: vi.fn(),
    };

    prepareCanvasForDocumentLoad({
      canvas: canvas as never,
      canvasSize: { height: 20, width: 30 },
      viewportDevicePixelRatioBaseline: 2,
      zoomLevel: 1.5,
    });

    expect('backgroundImage' in canvas).toBe(false);
    expect(canvas.setZoom).toHaveBeenCalledWith(1);
    expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 20, width: 30 });
    expect(mocks.applyEditorViewportZoom).toHaveBeenCalledWith(
      canvas,
      { height: 20, width: 30 },
      1.5,
      2
    );
    expect(canvas.backgroundColor).toBe('transparent');
  });
}

function registerCanvasMaskTest() {
  it('masks and restores canvas element background during load', () => {
    const style = { backgroundColor: 'initial' };
    const restore = maskCanvasElementDuringLoad(
      { getElement: () => ({ style }) } as never,
      '#112233'
    );

    expect(style.backgroundColor).toBe('#112233');
    restore?.();
    expect(style.backgroundColor).toBe('initial');
  });
}

function registerCanvasRenderTest() {
  it('uses sync render when available and falls back to requestRenderAll', () => {
    const renderAllCanvas = { renderAll: vi.fn(), requestRenderAll: vi.fn() };
    renderCanvasAfterDocumentLoad(renderAllCanvas as never);
    expect(renderAllCanvas.renderAll).toHaveBeenCalledOnce();

    const asyncCanvas = { requestRenderAll: vi.fn() };
    renderCanvasAfterDocumentLoad(asyncCanvas as never);
    expect(asyncCanvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function runDocumentApplyCanvasSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerPrepareCanvasTest();
  registerCanvasMaskTest();
  registerCanvasRenderTest();
}

describe('document apply canvas owner', runDocumentApplyCanvasSuite);
