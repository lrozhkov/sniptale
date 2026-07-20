/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyViewportPanSessionMock: vi.fn(),
  applyViewportZoomMock: vi.fn(),
  captureViewportAnchorMock: vi.fn(() => ({ relativeX: 0.25, relativeY: 0.75 })),
  getLayerObjectsMock: vi.fn(() => []),
  getStageInsetsMock: vi.fn(() => ({ horizontal: 20, vertical: 30 })),
  getViewportFitAreaMock: vi.fn(() => ({
    centerX: 90,
    centerY: 80,
    height: 160,
    width: 200,
  })),
  getViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 10,
    canvasOffsetTop: 20,
    domScaleCompensation: 1,
    scaledCanvasHeight: 200,
    scaledCanvasWidth: 300,
    viewportHeight: 100,
    viewportWidth: 150,
  })),
  restoreViewportAnchorMock: vi.fn(),
  shouldStartViewportPanMock: vi.fn(() => true),
}));

vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  getLayerObjects: mocks.getLayerObjectsMock,
}));

vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  applyEditorViewportZoom: mocks.applyViewportZoomMock,
  captureEditorViewportAnchor: mocks.captureViewportAnchorMock,
  getEditorStageInsets: mocks.getStageInsetsMock,
  getEditorViewportFitArea: mocks.getViewportFitAreaMock,
  getEditorViewportMetrics: mocks.getViewportMetricsMock,
  restoreEditorViewportAnchor: mocks.restoreViewportAnchorMock,
}));

vi.mock('../input/pan', () => ({
  applyViewportPanSession: mocks.applyViewportPanSessionMock,
  createViewportPanSession: vi.fn((viewportElement, event) => ({
    originX: event.clientX,
    originY: event.clientY,
    viewportElement,
  })),
  shouldStartViewportPan: mocks.shouldStartViewportPanMock,
}));

import {
  focusEditorObjectInViewport,
  sendEditorFrameObjectsToBack,
  ensureEditorObjectReachable,
  ensureEditorObjectsReachable,
} from '../document/visibility';
import {
  finishEditorViewportPan,
  moveEditorViewportPan,
  scheduleEditorViewportStateSyncFrame,
  startEditorViewportPan,
} from './interactions';
import { navigateEditorViewportTo, setEditorZoom, zoomEditorToFit } from './actions';

describe('viewport, visibility, and zoom seams', () => {
  it('keeps layer objects reachable and focuses them inside the viewport', () => {
    const frame = { sniptaleRole: 'frame' };
    const annotation = {
      getBoundingRect: () => ({ height: 180, left: -200, top: -180, width: 200 }),
      left: 0,
      set: vi.fn(function set(this: any, next: Record<string, number>) {
        this.left = next['left'];
        this.top = next['top'];
      }),
      setCoords: vi.fn(),
      top: 0,
    } as any;
    const canvas = {
      getObjects: () => [frame, annotation],
      sendObjectToBack: vi.fn(),
    } as any;
    mocks.getLayerObjectsMock.mockReturnValue([annotation] as any);

    expect(sendEditorFrameObjectsToBack(null, vi.fn())).toBeUndefined();
    const ensureBrowserFrameOnTop = vi.fn();
    sendEditorFrameObjectsToBack(canvas, ensureBrowserFrameOnTop);
    expect(canvas.sendObjectToBack).toHaveBeenCalledWith(frame);
    expect(ensureBrowserFrameOnTop).toHaveBeenCalledOnce();

    expect(ensureEditorObjectReachable(null, { height: 10, width: 10 }, annotation as never)).toBe(
      false
    );
    expect(
      ensureEditorObjectReachable(canvas, { height: 100, width: 100 }, annotation as never)
    ).toBe(true);
    expect(annotation.setCoords).toHaveBeenCalled();
    expect(ensureEditorObjectsReachable(canvas, { height: 100, width: 100 })).toBe(true);

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const viewportElement = { scrollLeft: 0, scrollTop: 0 } as HTMLElement;
    focusEditorObjectInViewport({
      canvasDocumentSize: { height: 100, width: 100 },
      devicePixelRatioBaseline: 1,
      object: { getBoundingRect: () => ({ height: 20, left: 20, top: 40, width: 10 }) } as never,
      onSynced: vi.fn(),
      stageElement: {} as HTMLElement,
      viewportElement,
      zoomLevel: 2,
    });
    expect(viewportElement.scrollLeft).toBeGreaterThanOrEqual(0);
    vi.unstubAllGlobals();
  });

  it('starts, moves, finishes, and schedules viewport pan interactions', () => {
    const viewportElement = {
      classList: { add: vi.fn(), remove: vi.fn() },
    } as any;
    const event = {
      clientX: 10,
      clientY: 12,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as any;

    const panSession = startEditorViewportPan({ event, isSpacePressed: false, viewportElement });
    moveEditorViewportPan({
      event: { preventDefault: vi.fn() } as any,
      panSession,
      viewportElement,
    });
    expect(mocks.applyViewportPanSessionMock).toHaveBeenCalled();
    expect(finishEditorViewportPan({ panSession, viewportElement })).toBeNull();
    expect(viewportElement.classList.remove).toHaveBeenCalledWith('cursor-grabbing');

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 5;
    });
    const setViewportSyncFrame = vi.fn();
    const syncViewportState = vi.fn();
    scheduleEditorViewportStateSyncFrame({
      setViewportSyncFrame,
      syncViewportState,
      viewportSyncFrame: 0,
    });
    scheduleEditorViewportStateSyncFrame({
      setViewportSyncFrame,
      syncViewportState,
      viewportSyncFrame: 1,
    });
    expect(setViewportSyncFrame).toHaveBeenCalled();
    expect(syncViewportState).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('zooms to fit, sets explicit zoom, and navigates the viewport', () => {
    const canvas = { requestRenderAll: vi.fn() } as any;
    const viewportElement = {
      clientHeight: 180,
      clientWidth: 220,
      scrollLeft: 0,
      scrollTop: 0,
    } as any;

    expect(
      zoomEditorToFit({
        canvas: null,
        canvasDocumentSize: { height: 100, width: 100 },
        stageElement: null,
        syncRuntimeState: vi.fn(),
        syncViewportState: vi.fn(),
        viewportElement,
        zoomLevel: 2,
      })
    ).toBe(2);

    const fitZoom = zoomEditorToFit({
      canvas,
      canvasDocumentSize: { height: 100, width: 100 },
      devicePixelRatioBaseline: 1,
      stageElement: {} as HTMLElement,
      syncRuntimeState: vi.fn(),
      syncViewportState: vi.fn(),
      viewportElement,
      zoomLevel: 2,
    });
    expect(fitZoom).toBeLessThanOrEqual(1);

    expect(
      setEditorZoom(
        {
          canvas,
          canvasDocumentSize: { height: 100, width: 100 },
          devicePixelRatioBaseline: 1,
          stageElement: {} as HTMLElement,
          syncRuntimeState: vi.fn(),
          syncViewportState: vi.fn(),
          viewportElement,
          zoomLevel: 1,
        },
        3.5
      )
    ).toBe(3.5);
    expect(mocks.captureViewportAnchorMock).toHaveBeenCalled();
    expect(mocks.restoreViewportAnchorMock).toHaveBeenCalled();

    navigateEditorViewportTo({
      canvasDocumentSize: { height: 100, width: 100 },
      devicePixelRatioBaseline: 1,
      relativeX: 0.5,
      relativeY: 0.5,
      stageElement: {} as HTMLElement,
      syncViewportState: vi.fn(),
      viewportElement,
      zoomLevel: 2,
    });
    expect(viewportElement.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(viewportElement.scrollTop).toBeGreaterThanOrEqual(0);
  });
});
