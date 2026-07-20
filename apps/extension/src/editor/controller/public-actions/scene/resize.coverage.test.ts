import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  finalizeEditorSceneMutationMock: vi.fn(),
  shouldFitSourceToContentMock: vi.fn(() => true),
  shouldPreserveCanvasForBrowserFrameMock: vi.fn(() => false),
}));

vi.mock('../../../browser-frame/layout', () => ({
  shouldFitSourceToContent: mocks.shouldFitSourceToContentMock,
  shouldPreserveCanvasForBrowserFrame: mocks.shouldPreserveCanvasForBrowserFrameMock,
}));
vi.mock('./helpers', () => ({
  finalizeEditorSceneMutation: mocks.finalizeEditorSceneMutationMock,
}));

import { MIN_CANVAS_SIZE } from '../../../document/model';
import {
  applyEditorFrameSceneSettings,
  resizeEditorCanvasScene,
  resizeEditorSourceScene,
} from './resize';

function createBaseOptions() {
  const frame = {
    backgroundColor: '#fff',
    layoutMode: 'expand-canvas',
    paddingTop: 128,
    paddingRight: 128,
    paddingBottom: 128,
    paddingLeft: 128,
  };

  return {
    canvas: { setDimensions: vi.fn() },
    commitHistory: vi.fn(),
    ensureReachableObjects: vi.fn(() => false),
    getCanvasDocumentSize: () => ({ height: 500, width: 800 }),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    source: { dataUrl: 'data:image/png;base64,abc' } as { dataUrl: string },
    store: {
      getBrowserFrame: vi.fn(() => ({ enabled: false })),
      getFrame: vi.fn(() => frame),
      updateFrame: vi.fn(),
    },
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    width: MIN_CANVAS_SIZE - 20,
    height: 420.7,
    zoomLevel: 1.5,
  };
}

function registerCanvasResizeTests() {
  it('relayouts source-backed canvases instead of resizing the canvas directly', () => {
    const options = createBaseOptions();
    const relayoutScene = vi.fn();
    const setCanvasDocumentSize = vi.fn();

    resizeEditorCanvasScene({ ...options, relayoutScene, setCanvasDocumentSize } as never);

    expect(relayoutScene).toHaveBeenCalledWith(
      options.store.getFrame(),
      options.store.getBrowserFrame(),
      {
        canvasSize: { height: 421, width: MIN_CANVAS_SIZE },
        fitSourceToContent: true,
        preserveCanvasSize: true,
      }
    );
    expect(mocks.finalizeEditorSceneMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
    );
  });

  it('resizes the canvas directly when no source exists', () => {
    const options = createBaseOptions();
    const relayoutScene = vi.fn();
    const setCanvasDocumentSize = vi.fn();

    resizeEditorCanvasScene({
      ...options,
      relayoutScene,
      setCanvasDocumentSize,
      source: null,
    } as never);

    expect(setCanvasDocumentSize).toHaveBeenCalledWith({
      height: 421,
      width: MIN_CANVAS_SIZE,
    });
    expect(options.canvas.setDimensions).toHaveBeenCalledWith({
      height: 421,
      width: MIN_CANVAS_SIZE,
    });
    expect(mocks.finalizeEditorSceneMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
    );
  });
}

function registerSourceAndFrameTests() {
  it('resizes source scenes only when canvas and source exist', () => {
    const options = createBaseOptions();
    const relayoutScene = vi.fn();

    resizeEditorSourceScene({ ...options, relayoutScene } as never);
    expect(relayoutScene).toHaveBeenCalledWith(
      options.store.getFrame(),
      options.store.getBrowserFrame(),
      {
        fitSourceToContent: true,
        preserveCanvasSize: false,
        sourceSize: { height: 421, width: MIN_CANVAS_SIZE },
      }
    );
    expect(mocks.finalizeEditorSceneMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
    );

    resizeEditorSourceScene({ ...options, canvas: null, relayoutScene } as never);
    resizeEditorSourceScene({ ...options, relayoutScene, source: null } as never);
    expect(relayoutScene).toHaveBeenCalledTimes(1);
  });

  it('applies frame settings only when canvas and source exist', () => {
    const options = createBaseOptions();
    const relayoutScene = vi.fn();
    const frame = { backgroundColor: '#000' };

    applyEditorFrameSceneSettings({ ...options, frame, relayoutScene } as never);
    expect(options.store.updateFrame).toHaveBeenCalledWith(frame);
    expect(mocks.finalizeEditorSceneMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
    );

    applyEditorFrameSceneSettings({
      ...options,
      canvas: null,
      frame,
      relayoutScene,
    } as never);
    expect(options.store.updateFrame).toHaveBeenCalledTimes(1);
  });
}

function registerBackgroundOnlyFrameTest() {
  it('keeps the current canvas size when only background fields change', () => {
    const options = createBaseOptions();
    const relayoutScene = vi.fn();
    const frame = {
      backgroundColor: '#000',
      layoutMode: options.store.getFrame().layoutMode,
      paddingTop: options.store.getFrame().paddingTop,
      paddingRight: options.store.getFrame().paddingRight,
      paddingBottom: options.store.getFrame().paddingBottom,
      paddingLeft: options.store.getFrame().paddingLeft,
    };

    applyEditorFrameSceneSettings({ ...options, frame, relayoutScene } as never);

    expect(relayoutScene).not.toHaveBeenCalled();
    expect(options.store.updateFrame).toHaveBeenCalledWith(frame);
    expect(mocks.finalizeEditorSceneMutationMock).toHaveBeenCalledOnce();
  });
}

function runSceneResizeSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerCanvasResizeTests();
  registerSourceAndFrameTests();
  registerBackgroundOnlyFrameTest();
}

describe('editor-controller scene resize actions', runSceneResizeSuite);
