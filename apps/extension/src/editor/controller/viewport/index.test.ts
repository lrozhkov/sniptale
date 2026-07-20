// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

import {
  applyEditorViewportZoom,
  buildEditorViewportState,
  captureEditorViewportAnchor,
  getEditorViewportFitArea,
  getEditorStageInsets,
  getEditorViewportMetrics,
  restoreEditorViewportAnchor,
} from './';

const DEFAULT_CANVAS_SIZE = { width: 200, height: 100 };
const DEFAULT_SOURCE = { displayHeight: 100, displayWidth: 200, name: 'image.png' } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

function createViewportElement() {
  const viewportElement = document.createElement('div');
  Object.defineProperties(viewportElement, {
    clientHeight: { configurable: true, value: 180 },
    clientWidth: { configurable: true, value: 320 },
    scrollLeft: { configurable: true, value: 45, writable: true },
    scrollTop: { configurable: true, value: 30, writable: true },
  });
  return viewportElement;
}

function createViewportFixture() {
  const viewportElement = createViewportElement();
  const stageElement = document.createElement('div');
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    paddingBottom: '8px',
    paddingLeft: '10px',
    paddingRight: '14px',
    paddingTop: '6px',
  } as CSSStyleDeclaration);

  return { stageElement, viewportElement };
}

it('builds viewport metrics and state from stage padding and zoom', () => {
  const { stageElement, viewportElement } = createViewportFixture();

  expect(getEditorStageInsets(stageElement, viewportElement)).toEqual({
    horizontal: 24,
    vertical: 14,
  });

  expect(
    getEditorViewportMetrics({
      viewportElement,
      stageElement,
      canvasDocumentSize: DEFAULT_CANVAS_SIZE,
      zoomLevel: 2,
    })
  ).toEqual(
    expect.objectContaining({
      canvasOffsetLeft: 12,
      canvasOffsetTop: 7,
      scaledCanvasHeight: 200,
      scaledCanvasWidth: 400,
      scrollLeft: 45,
      scrollTop: 30,
      viewportHeight: 180,
      viewportWidth: 320,
    })
  );

  expect(
    buildEditorViewportState({
      viewportElement,
      stageElement,
      canvasDocumentSize: DEFAULT_CANVAS_SIZE,
      zoomLevel: 2,
      source: DEFAULT_SOURCE,
    })
  ).toEqual(
    expect.objectContaining({
      canvasHeight: 100,
      canvasWidth: 200,
      sourceHeight: 100,
      sourceName: 'image.png',
      sourceWidth: 200,
      zoomPercent: 200,
    })
  );
});

it('returns safe defaults when viewport context is incomplete', () => {
  expect(getEditorStageInsets(null, null)).toEqual({ horizontal: 0, vertical: 0 });
  expect(
    buildEditorViewportState({
      viewportElement: null,
      stageElement: null,
      canvasDocumentSize: DEFAULT_CANVAS_SIZE,
      zoomLevel: 2,
      source: null,
    })
  ).toEqual(
    expect.objectContaining({
      canvasHeight: 0,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
      canvasWidth: 0,
      scaledCanvasHeight: 0,
      scaledCanvasWidth: 0,
      scrollLeft: 0,
      scrollTop: 0,
      sourceHeight: 0,
      sourceName: null,
      sourceWidth: 0,
      viewportHeight: 0,
      viewportWidth: 0,
      zoomPercent: 200,
    })
  );
});

it('resolves a floating-toolbar aware fit area without using stage pan padding', () => {
  const viewportElement = createViewportElement();
  Object.defineProperty(viewportElement, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(viewportElement, 'clientHeight', { configurable: true, value: 800 });
  viewportElement.getBoundingClientRect = () =>
    ({
      bottom: 800,
      height: 800,
      left: 0,
      right: 1200,
      top: 0,
      width: 1200,
    }) as DOMRect;
  const documentBar = document.createElement('div');
  const viewControls = document.createElement('div');
  const toolRail = document.createElement('div');
  documentBar.setAttribute('data-ui', 'editor.floating.document-bar');
  viewControls.setAttribute('data-ui', 'editor.floating.view-controls');
  toolRail.setAttribute('data-ui', 'editor.floating.tool-rail.stack');
  document.body.append(documentBar, viewControls, toolRail);
  documentBar.getBoundingClientRect = () =>
    ({ bottom: 50, height: 42, left: 8, right: 420, top: 8, width: 412 }) as DOMRect;
  viewControls.getBoundingClientRect = () =>
    ({ bottom: 54, height: 42, left: 980, right: 1188, top: 12, width: 208 }) as DOMRect;
  toolRail.getBoundingClientRect = () =>
    ({ bottom: 650, height: 500, left: 12, right: 58, top: 150, width: 46 }) as DOMRect;

  expect(getEditorViewportFitArea(viewportElement)).toEqual({
    centerX: 625,
    centerY: 423,
    height: 706,
    width: 1102,
  });

  documentBar.remove();
  viewControls.remove();
  toolRail.remove();
});

it('captures and restores viewport anchor', () => {
  const { stageElement, viewportElement } = createViewportFixture();
  const requestAnimationFrameSpy = vi
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

  const anchor = captureEditorViewportAnchor({
    canvas: {} as never,
    viewportElement,
    stageElement,
    canvasDocumentSize: DEFAULT_CANVAS_SIZE,
    zoomLevel: 2,
  });

  expect(anchor).toEqual({
    relativeX: 0.4825,
    relativeY: 0.565,
  });

  const onSynced = vi.fn();
  restoreEditorViewportAnchor({
    anchor,
    canvas: {} as never,
    canvasDocumentSize: DEFAULT_CANVAS_SIZE,
    onSynced,
    stageElement,
    viewportElement,
    zoomLevel: 2,
  });

  expect(requestAnimationFrameSpy).toHaveBeenCalledOnce();
  expect(viewportElement.scrollLeft).toBeCloseTo(45);
  expect(viewportElement.scrollTop).toBeCloseTo(30);
  expect(onSynced).toHaveBeenCalledOnce();
});

it('guards null anchors', () => {
  const { stageElement, viewportElement } = createViewportFixture();

  expect(
    captureEditorViewportAnchor({
      canvas: null,
      viewportElement,
      stageElement,
      canvasDocumentSize: DEFAULT_CANVAS_SIZE,
      zoomLevel: 2,
    })
  ).toBeNull();

  restoreEditorViewportAnchor({
    anchor: null,
    canvas: {} as never,
    canvasDocumentSize: DEFAULT_CANVAS_SIZE,
    onSynced: vi.fn(),
    stageElement,
    viewportElement,
    zoomLevel: 2,
  });
});

it('applies viewport zoom to the fabric canvas and guards null canvases', () => {
  const canvas = {
    calcOffset: vi.fn(),
    setDimensions: vi.fn(),
  };

  applyEditorViewportZoom(canvas as never, { width: 400, height: 200 }, 1.5);
  applyEditorViewportZoom(null, { width: 400, height: 200 }, 1.5);

  expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 300, width: 600 }, { cssOnly: true });
  expect(canvas.calcOffset).toHaveBeenCalledOnce();
});

it('keeps logical viewport metrics stable when browser page zoom changes', () => {
  vi.stubGlobal('devicePixelRatio', 0.5);
  const { stageElement, viewportElement } = createViewportFixture();

  expect(
    getEditorViewportMetrics({
      viewportElement,
      stageElement,
      canvasDocumentSize: DEFAULT_CANVAS_SIZE,
      zoomLevel: 1,
      devicePixelRatioBaseline: 1,
    })
  ).toEqual(
    expect.objectContaining({
      domScaleCompensation: 2,
      scrollLeft: 22.5,
      scrollTop: 15,
      viewportHeight: 90,
      viewportWidth: 160,
    })
  );

  expect(
    buildEditorViewportState({
      viewportElement,
      stageElement,
      canvasDocumentSize: DEFAULT_CANVAS_SIZE,
      zoomLevel: 1,
      source: DEFAULT_SOURCE,
      devicePixelRatioBaseline: 1,
    }).zoomPercent
  ).toBe(100);

  const canvas = {
    calcOffset: vi.fn(),
    setDimensions: vi.fn(),
  };
  applyEditorViewportZoom(canvas as never, { width: 200, height: 100 }, 1, 1);

  expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 200, width: 400 }, { cssOnly: true });
});
