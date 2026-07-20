// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoomMock: vi.fn(),
  captureEditorViewportAnchorMock: vi.fn(() => ({ relativeX: 0.25, relativeY: 0.75 })),
  getEditorViewportFitAreaMock: vi.fn(() => ({
    centerX: 220,
    centerY: 170,
    height: 250,
    width: 360,
  })),
  getEditorViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 30,
    canvasOffsetTop: 18,
    domScaleCompensation: 1,
    scaledCanvasHeight: 500,
    scaledCanvasWidth: 600,
    viewportHeight: 200,
    viewportWidth: 300,
  })),
  restoreEditorViewportAnchorMock: vi.fn(),
}));

vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoomMock,
  captureEditorViewportAnchor: mocks.captureEditorViewportAnchorMock,
  getEditorViewportFitArea: mocks.getEditorViewportFitAreaMock,
  getEditorViewportMetrics: mocks.getEditorViewportMetricsMock,
  restoreEditorViewportAnchor: mocks.restoreEditorViewportAnchorMock,
}));

import { navigateEditorViewportTo, setEditorZoom, zoomEditorToFit } from '../viewport/actions';

function createZoomContext() {
  const canvas = { requestRenderAll: vi.fn() };
  const viewport = document.createElement('div');
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 420 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 310 });
  return {
    canvas,
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    viewport,
  };
}

function registerZoomToFitTest() {
  it('zooms to fit and restores an anchored viewport zoom', () => {
    const { canvas, syncRuntimeState, syncViewportState, viewport } = createZoomContext();
    const requestAnimationFrameSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });

    const fitZoom = zoomEditorToFit({
      canvas: canvas as never,
      canvasDocumentSize: { height: 200, width: 300 },
      stageElement: document.createElement('div'),
      syncRuntimeState,
      syncViewportState,
      viewportElement: viewport,
      zoomLevel: 1.5,
    });

    expect(fitZoom).toBeLessThanOrEqual(1);
    expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
      canvas,
      { height: 200, width: 300 },
      fitZoom,
      undefined
    );
    expect(mocks.getEditorViewportFitAreaMock).toHaveBeenCalledWith(viewport, undefined);
    expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();
    expect(viewport.scrollLeft).toBe(110);
    expect(viewport.scrollTop).toBe(98);
    expect(syncViewportState).toHaveBeenCalledOnce();
    expect(mocks.restoreEditorViewportAnchorMock).not.toHaveBeenCalled();
  });
}

function registerNoCanvasZoomTest() {
  it('returns the current zoom when no canvas is available', () => {
    const { syncRuntimeState, syncViewportState, viewport } = createZoomContext();

    expect(
      setEditorZoom(
        {
          canvas: null,
          canvasDocumentSize: { height: 200, width: 300 },
          stageElement: null,
          syncRuntimeState,
          syncViewportState,
          viewportElement: viewport,
          zoomLevel: 1.25,
        },
        2.5
      )
    ).toBe(1.25);
  });
}

function registerViewportNavigationTest() {
  it('navigates the viewport to the requested normalized position', () => {
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      value: 0,
      writable: true,
    });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    });
    const syncViewportState = vi.fn();

    navigateEditorViewportTo({
      canvasDocumentSize: { height: 300, width: 400 },
      relativeX: 0.5,
      relativeY: 0.25,
      stageElement: document.createElement('div'),
      syncViewportState,
      viewportElement: viewport,
      zoomLevel: 2,
    });

    expect(viewport.scrollLeft).toBe(180);
    expect(viewport.scrollTop).toBe(43);
    expect(syncViewportState).toHaveBeenCalledOnce();
  });
}

describe('editor-controller zoom seams', () => {
  registerZoomToFitTest();
  registerNoCanvasZoomTest();
  registerViewportNavigationTest();
});
