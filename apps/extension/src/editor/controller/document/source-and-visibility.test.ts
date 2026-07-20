// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  FabricImageFromURLMock: vi.fn(),
  getEditorViewportMetricsMock: vi.fn(() => ({
    canvasOffsetLeft: 40,
    canvasOffsetTop: 20,
    domScaleCompensation: 2,
    viewportHeight: 200,
    viewportWidth: 300,
  })),
  getFabricImageIntrinsicSizeMock: vi.fn(() => ({ height: 100, width: 200 })),
  getLayerObjectsMock: vi.fn(() => []),
  getSourceObjectMock: vi.fn(() => null),
  isFrameObjectMock: vi.fn((object: { role?: string }) => object.role === 'frame'),
  isSourceObjectMock: vi.fn((object: { role?: string }) => object.role === 'source'),
  logEditorSourceTraceMock: vi.fn(),
  translateMock: vi.fn(() => 'editor.runtime.sourceImage'),
}));

class MockFabricImage {
  height = 100;
  scaleX = 1;
  scaleY = 1;
  visible = true;
  width = 200;
  set(values: Record<string, unknown>) {
    Object.assign(this, values);
    return this;
  }
  getScaledHeight() {
    return (this.height ?? 0) * (this.scaleY ?? 1);
  }
  getScaledWidth() {
    return (this.width ?? 0) * (this.scaleX ?? 1);
  }
}

vi.mock('fabric', () => ({ FabricImage: { fromURL: mocks.FabricImageFromURLMock } }));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));
vi.mock('../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/debug')>()),
  logEditorSourceTrace: mocks.logEditorSourceTraceMock,
}));
vi.mock('./layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./layers')>()),
  getLayerObjects: mocks.getLayerObjectsMock,
  getSourceObject: mocks.getSourceObjectMock,
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    getFabricImageIntrinsicSize: mocks.getFabricImageIntrinsicSizeMock,
    isFrameObject: mocks.isFrameObjectMock,
    isSourceObject: mocks.isSourceObjectMock,
  };
});
vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  getEditorViewportMetrics: mocks.getEditorViewportMetricsMock,
}));

import { ensureEditorSourceLayer, syncSourceStateFromObject } from './source';
import {
  ensureEditorObjectReachable,
  ensureEditorObjectsReachable,
  focusEditorObjectInViewport,
  sendEditorFrameObjectsToBack,
} from './visibility';

function registerSourceStateTests() {
  it('syncs source state from source-image objects and preserves unrelated objects', () => {
    const source = {
      dataUrl: 'data:image/png;base64,abc',
      displayHeight: 90,
      displayWidth: 180,
      id: 'source-1',
      left: 8,
      locked: false,
      name: 'capture.png',
      top: 12,
      visible: true,
    };
    const object = {
      getScaledHeight: () => 120,
      getScaledWidth: () => 240,
      left: 30,
      sniptaleId: 'source-2',
      sniptaleLocked: true,
      role: 'source',
      top: 40,
      visible: false,
    };

    expect(syncSourceStateFromObject(source as never, null)).toBe(source);
    expect(syncSourceStateFromObject(source as never, { role: 'other' } as never)).toBe(source);
    expect(syncSourceStateFromObject(source as never, object as never)).toEqual(
      expect.objectContaining({ id: 'source-2', locked: true, visible: false })
    );
  });
}

function registerSourceLayerGuardTests() {
  it('returns early when canvas or source is missing', async () => {
    expect(
      await ensureEditorSourceLayer({
        canvas: null,
        prepareObject: vi.fn(),
        source: null,
      })
    ).toBeNull();
  });
}

function registerSourceLayerReuseTests() {
  it('reuses an existing source layer', async () => {
    const source = {
      dataUrl: 'data:image/png;base64,abc',
      displayHeight: 50,
      displayWidth: 100,
      id: 'source-1',
      left: 10,
      locked: true,
      name: 'capture.png',
      top: 20,
      visible: true,
    };
    const existing = {
      getScaledHeight: () => 55,
      getScaledWidth: () => 110,
      sniptaleId: 'source-existing',
      role: 'source',
      visible: true,
    };
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => []),
      sendObjectToBack: vi.fn(),
    };

    mocks.getSourceObjectMock.mockImplementation(() => existing as never);
    const reused = await ensureEditorSourceLayer({
      canvas: canvas as never,
      prepareObject: vi.fn(),
      source: source as never,
    });

    expect(reused).toEqual(expect.objectContaining({ id: 'source-existing' }));
    expect(canvas.add).not.toHaveBeenCalled();
  });
}

function registerSourceLayerCreateTests() {
  it('creates a new source layer when none exists', async () => {
    const source = {
      dataUrl: 'data:image/png;base64,abc',
      displayHeight: 50,
      displayWidth: 100,
      id: 'source-1',
      left: 10,
      locked: true,
      name: 'capture.png',
      top: 20,
      visible: true,
    };
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => []),
      sendObjectToBack: vi.fn(),
    };
    const prepareObject = vi.fn();

    mocks.getSourceObjectMock.mockImplementation(() => null);
    const created = await ensureEditorSourceLayer({
      canvas: canvas as never,
      prepareObject,
      source: source as never,
    });

    expect(mocks.FabricImageFromURLMock).toHaveBeenCalledWith(source.dataUrl);
    expect(prepareObject).toHaveBeenCalledOnce();
    expect(canvas.add).toHaveBeenCalledOnce();
    expect(canvas.sendObjectToBack).toHaveBeenCalledOnce();
    expect(created).toEqual(expect.objectContaining({ displayHeight: 50, displayWidth: 100 }));
  });
}

function createReachableObject() {
  return {
    getBoundingRect: () => ({ height: 60, left: -20, top: 260, width: 80 }),
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
}

function registerVisibilityReachabilityTests() {
  it('keeps frame objects behind content and repositions off-screen objects', () => {
    const frameObject = { role: 'frame' };
    const userObject = createReachableObject();
    const canvas = {
      getObjects: () => [frameObject, { role: 'other' }],
      sendObjectToBack: vi.fn(),
    };
    const ensureBrowserFrameOnTop = vi.fn();

    sendEditorFrameObjectsToBack(canvas as never, ensureBrowserFrameOnTop);
    expect(canvas.sendObjectToBack).toHaveBeenCalledWith(frameObject);
    expect(ensureBrowserFrameOnTop).toHaveBeenCalledOnce();

    expect(
      ensureEditorObjectReachable(
        canvas as never,
        { height: 200, width: 300 },
        userObject as unknown as never
      )
    ).toBe(true);
    expect(userObject.setCoords).toHaveBeenCalledOnce();

    mocks.getLayerObjectsMock.mockReturnValue([userObject as unknown as never]);
    expect(ensureEditorObjectsReachable(canvas as never, { height: 200, width: 300 })).toBe(true);
  });
}

function registerVisibilityFocusTests() {
  it('focuses objects inside the viewport on the next animation frame', () => {
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
    expect(mocks.getEditorViewportMetricsMock).toHaveBeenCalledWith(
      expect.objectContaining({ devicePixelRatioBaseline: 1 })
    );
    expect(onSynced).toHaveBeenCalledOnce();
  });
}

function runSourceAndVisibilitySuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.FabricImageFromURLMock.mockResolvedValue(new MockFabricImage());
    mocks.getLayerObjectsMock.mockReturnValue([]);
    mocks.getSourceObjectMock.mockImplementation(() => null);
  });

  registerSourceStateTests();
  registerSourceLayerGuardTests();
  registerSourceLayerReuseTests();
  registerSourceLayerCreateTests();
  registerVisibilityReachabilityTests();
  registerVisibilityFocusTests();
}

describe('editor-controller source and visibility seams', runSourceAndVisibilitySuite);
