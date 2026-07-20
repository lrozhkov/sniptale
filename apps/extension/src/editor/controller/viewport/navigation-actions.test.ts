import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 10,
    canvasOffsetTop: 20,
    domScaleCompensation: 2,
    scaledCanvasHeight: 200,
    scaledCanvasWidth: 300,
    viewportHeight: 100,
    viewportWidth: 150,
  })),
}));

vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  getEditorViewportMetrics: mocks.getViewportMetricsMock,
}));

import { navigateEditorViewportTo } from './navigation-actions';

beforeEach(() => {
  vi.clearAllMocks();
});

it('owns relative viewport navigation scroll math and sync', () => {
  const viewportElement = { scrollLeft: 0, scrollTop: 0 } as HTMLElement;
  const syncViewportState = vi.fn();

  navigateEditorViewportTo({
    canvasDocumentSize: { height: 100, width: 100 },
    devicePixelRatioBaseline: 1,
    relativeX: 0.5,
    relativeY: 0.25,
    stageElement: {} as HTMLElement,
    syncViewportState,
    viewportElement,
    zoomLevel: 2,
  });

  expect(mocks.getViewportMetricsMock).toHaveBeenCalledWith(
    expect.objectContaining({ devicePixelRatioBaseline: 1, zoomLevel: 2 })
  );
  expect(viewportElement.scrollLeft).toBe(170);
  expect(viewportElement.scrollTop).toBe(40);
  expect(syncViewportState).toHaveBeenCalledOnce();
});

it('skips navigation without a viewport or measurable canvas', () => {
  const syncViewportState = vi.fn();

  navigateEditorViewportTo({
    canvasDocumentSize: { height: 100, width: 100 },
    relativeX: 0.5,
    relativeY: 0.5,
    stageElement: null,
    syncViewportState,
    viewportElement: null,
    zoomLevel: 1,
  });
  expect(mocks.getViewportMetricsMock).not.toHaveBeenCalled();
  expect(syncViewportState).not.toHaveBeenCalled();

  mocks.getViewportMetricsMock.mockReturnValueOnce({
    canvasOffsetLeft: 0,
    canvasOffsetTop: 0,
    domScaleCompensation: 1,
    scaledCanvasHeight: 0,
    scaledCanvasWidth: 100,
    viewportHeight: 100,
    viewportWidth: 100,
  });
  const viewportElement = { scrollLeft: 0, scrollTop: 0 } as HTMLElement;
  navigateEditorViewportTo({
    canvasDocumentSize: { height: 100, width: 100 },
    relativeX: 0.5,
    relativeY: 0.5,
    stageElement: null,
    syncViewportState,
    viewportElement,
    zoomLevel: 1,
  });

  expect(viewportElement.scrollLeft).toBe(0);
  expect(viewportElement.scrollTop).toBe(0);
  expect(syncViewportState).not.toHaveBeenCalled();
});
