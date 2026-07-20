// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEditorViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 40,
    canvasOffsetTop: 20,
    domScaleCompensation: 1,
    viewportHeight: 200,
    viewportWidth: 300,
  })),
  getLayerObjectsMock: vi.fn(() => []),
  isFrameObjectMock: vi.fn((object: { role?: string }) => object.role === 'frame'),
}));

vi.mock('./layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./layers')>()),
  getLayerObjects: mocks.getLayerObjectsMock,
}));

vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    isFrameObject: mocks.isFrameObjectMock,
  };
});

vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  getEditorViewportMetrics: mocks.getEditorViewportMetricsMock,
}));

import {
  ensureEditorObjectReachable,
  ensureEditorObjectsReachable,
  focusEditorObjectInViewport,
  sendEditorFrameObjectsToBack,
} from './visibility';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('visibility guard branches', () => {
  it('returns early for missing canvases, invalid bounds, and empty layer collections', () => {
    const canvas = {
      getObjects: () => [],
      sendObjectToBack: vi.fn(),
    };
    const ensureBrowserFrameOnTop = vi.fn();
    const stationaryObject = {
      getBoundingRect: () => ({ height: 10, left: 10, top: 12, width: 20 }),
      set: vi.fn(),
      setCoords: vi.fn(),
    };

    expect(sendEditorFrameObjectsToBack(null as never, ensureBrowserFrameOnTop)).toBeUndefined();
    expect(
      ensureEditorObjectReachable(
        canvas as never,
        { height: 0, width: 300 },
        stationaryObject as never
      )
    ).toBe(false);

    mocks.getLayerObjectsMock.mockReturnValue([]);
    expect(ensureEditorObjectsReachable(canvas as never, { height: 200, width: 300 })).toBe(false);
    expect(ensureBrowserFrameOnTop).not.toHaveBeenCalled();
  });

  it('returns early when no viewport element is available', () => {
    const onSynced = vi.fn();

    focusEditorObjectInViewport({
      canvasDocumentSize: { height: 200, width: 300 },
      devicePixelRatioBaseline: 1,
      object: {
        getBoundingRect: () => ({ height: 40, left: 100, top: 60, width: 80 }),
      } as never,
      onSynced,
      stageElement: document.createElement('div'),
      viewportElement: null,
      zoomLevel: 2,
    });

    expect(mocks.getEditorViewportMetricsMock).not.toHaveBeenCalled();
    expect(onSynced).not.toHaveBeenCalled();
  });
});
