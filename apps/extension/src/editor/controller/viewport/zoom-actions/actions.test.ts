// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoomMock: vi.fn(),
  captureEditorViewportAnchorMock: vi.fn(() => ({ relativeX: 0.25, relativeY: 0.75 })),
  getEditorViewportFitAreaMock: vi.fn(() => ({
    centerX: 100,
    centerY: 50,
    height: 100,
    width: 200,
  })),
  getEditorViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 10,
    canvasOffsetTop: 20,
    domScaleCompensation: 1,
    scaledCanvasHeight: 120,
    scaledCanvasWidth: 240,
  })),
  restoreEditorViewportAnchorMock: vi.fn(),
}));

vi.mock('..', async (importOriginal) => ({
  ...(await importOriginal<typeof import('..')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoomMock,
  captureEditorViewportAnchor: mocks.captureEditorViewportAnchorMock,
  getEditorViewportFitArea: mocks.getEditorViewportFitAreaMock,
  getEditorViewportMetrics: mocks.getEditorViewportMetricsMock,
  restoreEditorViewportAnchor: mocks.restoreEditorViewportAnchorMock,
}));

import { zoomEditorToFit } from './fit';
import { refreshEditorViewportPresentation } from './refresh';
import { setEditorZoom, setEditorZoomCentered } from './set';

function createContext() {
  return {
    canvas: { requestRenderAll: vi.fn() },
    canvasDocumentSize: { height: 100, width: 300 },
    devicePixelRatioBaseline: 1,
    stageElement: document.createElement('div'),
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    viewportElement: document.createElement('div'),
    zoomLevel: 1,
  };
}

function registerFitActionTest() {
  it('fits zoom from advisory viewport area and syncs runtime state immediately', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const context = createContext();

    expect(zoomEditorToFit(context as never)).toBeCloseTo(0.667, 3);
    expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
      context.canvas,
      context.canvasDocumentSize,
      0.667,
      1
    );
    expect(context.syncRuntimeState).toHaveBeenCalledOnce();
    expect(context.syncViewportState).toHaveBeenCalledOnce();
  });
}

function registerSetActionTest() {
  it('sets explicit and centered zoom through the viewport anchor owner', () => {
    const context = createContext();

    expect(setEditorZoom(context as never, 8)).toBe(4);
    expect(setEditorZoomCentered(context as never, 0.1)).toBe(0.2);
    expect(mocks.captureEditorViewportAnchorMock).toHaveBeenCalledOnce();
    expect(mocks.restoreEditorViewportAnchorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ anchor: { relativeX: 0.5, relativeY: 0.5 } })
    );
  });
}

function registerRefreshActionTest() {
  it('refreshes presentation at the logical zoom and syncs only when no anchor exists', () => {
    const anchoredContext = createContext();
    refreshEditorViewportPresentation(anchoredContext as never);

    mocks.captureEditorViewportAnchorMock.mockReturnValueOnce(null as never);
    const unanchoredContext = createContext();
    refreshEditorViewportPresentation(unanchoredContext as never);

    expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
      anchoredContext.canvas,
      anchoredContext.canvasDocumentSize,
      1,
      1
    );
    expect(anchoredContext.syncViewportState).not.toHaveBeenCalled();
    expect(unanchoredContext.syncViewportState).toHaveBeenCalledOnce();
  });
}

describe('editor viewport zoom action owners', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.applyEditorViewportZoomMock.mockClear();
    mocks.captureEditorViewportAnchorMock.mockClear();
    mocks.captureEditorViewportAnchorMock.mockReturnValue({ relativeX: 0.25, relativeY: 0.75 });
    mocks.getEditorViewportFitAreaMock.mockClear();
    mocks.getEditorViewportMetricsMock.mockClear();
    mocks.restoreEditorViewportAnchorMock.mockClear();
  });

  registerFitActionTest();
  registerSetActionTest();
  registerRefreshActionTest();
});
