// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEditorViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 40,
    canvasOffsetTop: 20,
    domScaleCompensation: 2,
    viewportHeight: 200,
    viewportWidth: 300,
  })),
  getLayerObjectsMock: vi.fn(() => []),
  isFrameObjectMock: vi.fn((object: { role?: string }) => object.role === 'frame'),
}));

vi.mock('../layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layers')>()),
  getLayerObjects: mocks.getLayerObjectsMock,
}));
vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isFrameObject: mocks.isFrameObjectMock,
}));
vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  getEditorViewportMetrics: mocks.getEditorViewportMetricsMock,
}));

import { sendEditorFrameObjectsToBack } from './frame-stack';
import { ensureEditorObjectReachable, ensureEditorObjectsReachable } from './reachability';
import { focusEditorObjectInViewport } from './viewport-focus';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLayerObjectsMock.mockReturnValue([]);
});

it('sends document frame objects behind content before restoring browser frame order', () => {
  const frameObject = { role: 'frame' };
  const canvas = {
    getObjects: () => [frameObject, { role: 'annotation' }],
    sendObjectToBack: vi.fn(),
  };
  const ensureBrowserFrameOnTop = vi.fn();

  sendEditorFrameObjectsToBack(canvas as never, ensureBrowserFrameOnTop);

  expect(canvas.sendObjectToBack).toHaveBeenCalledWith(frameObject);
  expect(ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
});

it('moves unreachable document objects back into the reachable canvas area', () => {
  const object = {
    getBoundingRect: () => ({ height: 60, left: -100, top: 260, width: 80 }),
    left: 5,
    set: vi.fn(function setPosition(
      this: { left: number; top: number },
      values: Record<string, number>
    ) {
      Object.assign(this, values);
      return this;
    }),
    setCoords: vi.fn(),
    top: 7,
  };

  expect(
    ensureEditorObjectReachable({} as never, { height: 200, width: 300 }, object as never)
  ).toBe(true);
  expect(object.set).toHaveBeenCalledWith({ left: 49, top: -77 });
  expect(object.setCoords).toHaveBeenCalledOnce();

  mocks.getLayerObjectsMock.mockReturnValue([object as never]);
  expect(ensureEditorObjectsReachable({} as never, { height: 200, width: 300 })).toBe(true);
});

it('focuses document objects inside the viewport on the next animation frame', () => {
  const viewport = document.createElement('div');
  Object.defineProperty(viewport, 'scrollLeft', { configurable: true, value: 0, writable: true });
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 0, writable: true });
  const onSynced = vi.fn();
  const original = window.requestAnimationFrame;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(16);
    return 1;
  }) as never;

  try {
    focusEditorObjectInViewport({
      canvasDocumentSize: { height: 200, width: 300 },
      object: {
        getBoundingRect: () => ({ height: 40, left: 100, top: 60, width: 80 }),
      } as never,
      onSynced,
      devicePixelRatioBaseline: 1,
      stageElement: document.createElement('div'),
      viewportElement: viewport,
      zoomLevel: 2,
    });
  } finally {
    window.requestAnimationFrame = original;
  }

  expect(viewport.scrollLeft).toBe(340);
  expect(viewport.scrollTop).toBe(160);
  expect(onSynced).toHaveBeenCalledOnce();
});

it('skips viewport focus when the viewport element is unavailable', () => {
  const onSynced = vi.fn();

  focusEditorObjectInViewport({
    canvasDocumentSize: { height: 200, width: 300 },
    object: {
      getBoundingRect: vi.fn(),
    } as never,
    onSynced,
    stageElement: null,
    viewportElement: null,
    zoomLevel: 2,
  });

  expect(onSynced).not.toHaveBeenCalled();
  expect(mocks.getEditorViewportMetricsMock).not.toHaveBeenCalled();
});
