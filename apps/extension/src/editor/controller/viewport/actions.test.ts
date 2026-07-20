// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import {
  navigateEditorViewportTo,
  refreshEditorViewportPresentation,
  setEditorZoom,
  setEditorZoomAtViewportPoint,
  setEditorZoomCentered,
  zoomEditorToFit,
} from './actions';
import { getDevicePixelRatioBaselineOptions } from './actions-types';
import { getEditorViewportMetrics } from './metrics';

const CANVAS_SIZE = { width: 200, height: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingBottom: '8px',
    paddingLeft: '10px',
    paddingRight: '14px',
    paddingTop: '6px',
  } as CSSStyleDeclaration);
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
    (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }
  );
});

function createZoomContext() {
  const viewportElement = document.createElement('div');
  const stageElement = document.createElement('div');
  Object.defineProperties(viewportElement, {
    clientHeight: { configurable: true, value: 180 },
    clientWidth: { configurable: true, value: 320 },
    scrollLeft: { configurable: true, value: 45, writable: true },
    scrollTop: { configurable: true, value: 30, writable: true },
  });
  Object.defineProperties(stageElement, {
    scrollHeight: { configurable: true, value: 700 },
    scrollWidth: { configurable: true, value: 900 },
  });
  viewportElement.getBoundingClientRect = () => ({ left: 20, top: 10 }) as DOMRect;

  return {
    canvas: {
      calcOffset: vi.fn(),
      requestRenderAll: vi.fn(),
      setDimensions: vi.fn(),
    },
    canvasDocumentSize: CANVAS_SIZE,
    stageElement,
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    viewportElement,
    zoomLevel: 1,
  };
}

it('routes fit, centered, explicit, and point zoom through viewport actions', () => {
  const context = createZoomContext();

  expect(getDevicePixelRatioBaselineOptions()).toEqual({});
  expect(getDevicePixelRatioBaselineOptions(1)).toEqual({ devicePixelRatioBaseline: 1 });
  expect(zoomEditorToFit(context as never)).toBe(1);
  expect(setEditorZoomCentered(context as never, 1.5)).toBe(1.5);
  expect(setEditorZoom(context as never, 2)).toBe(2);
  expect(setEditorZoomAtViewportPoint(context as never, 1.25, { clientX: 80, clientY: 60 })).toBe(
    1.25
  );

  expect(context.canvas.setDimensions).toHaveBeenCalled();
  expect(context.canvas.requestRenderAll).toHaveBeenCalled();
  expect(context.syncRuntimeState).toHaveBeenCalledTimes(4);
  expect(context.syncViewportState).toHaveBeenCalled();
});

it('navigates and refreshes viewport presentation while preserving anchor state', () => {
  const context = createZoomContext();

  navigateEditorViewportTo({ ...context, relativeX: 0.75, relativeY: 0.25 });
  refreshEditorViewportPresentation(context as never);

  expect(context.viewportElement.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(context.viewportElement.scrollTop).toBeGreaterThanOrEqual(0);
  expect(context.syncViewportState).toHaveBeenCalled();
  expect(context.canvas.requestRenderAll).toHaveBeenCalledOnce();
});

it('guards missing canvas and missing stage measurements', () => {
  const context = createZoomContext();

  expect(setEditorZoomCentered({ ...context, canvas: null } as never, 1.5)).toBe(1);
  expect(zoomEditorToFit({ ...context, canvas: null } as never)).toBe(1);
  expect(zoomEditorToFit({ ...context, viewportElement: null } as never)).toBe(1);
  expect(
    getEditorViewportMetrics({
      viewportElement: context.viewportElement,
      stageElement: null,
      canvasDocumentSize: CANVAS_SIZE,
      zoomLevel: 1,
    })
  ).toEqual(expect.objectContaining({ canvasOffsetLeft: 60, canvasOffsetTop: 40 }));
  expect(
    getEditorViewportMetrics({
      viewportElement: null,
      stageElement: context.stageElement,
      canvasDocumentSize: CANVAS_SIZE,
      zoomLevel: 2,
    })
  ).toEqual(expect.objectContaining({ viewportHeight: 0, viewportWidth: 0 }));
  expect(
    getEditorViewportMetrics({
      viewportElement: context.viewportElement,
      stageElement: {} as HTMLElement,
      canvasDocumentSize: CANVAS_SIZE,
      zoomLevel: 1,
    })
  ).toEqual(expect.objectContaining({ scaledCanvasWidth: 200, scaledCanvasHeight: 100 }));
});

it('falls back to viewport padding and zero numeric styles for metric calculation', () => {
  const viewportElement = document.createElement('div');
  Object.defineProperties(viewportElement, {
    clientHeight: { configurable: true, value: 100 },
    clientWidth: { configurable: true, value: 120 },
    scrollLeft: { configurable: true, value: 0 },
    scrollTop: { configurable: true, value: 0 },
  });
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingBottom: '',
    paddingLeft: 'bad',
    paddingRight: '0px',
    paddingTop: '',
  } as CSSStyleDeclaration);

  expect(
    getEditorViewportMetrics({
      viewportElement,
      stageElement: null,
      canvasDocumentSize: { width: 80, height: 80 },
      zoomLevel: 1,
      devicePixelRatioBaseline: 1,
    })
  ).toEqual(
    expect.objectContaining({
      canvasOffsetLeft: 20,
      canvasOffsetTop: 10,
      domScaleCompensation: 1,
    })
  );
});
