import { describe, expect, it, vi } from 'vitest';
import type { ApplyEditorControllerDocumentOptions } from './apply-types';
import type { CloseEditorControllerDocumentOptions } from './lifecycle/close/types';
import {
  createApplyEditorControllerDocumentSharedOptions,
  createApplyEditorControllerDocumentStateOptions,
  createCloseEditorControllerCanvasOptions,
  createPreparedEditorDocumentStateOptions,
} from './params';

function createCloseOptions(): CloseEditorControllerDocumentOptions & {
  canvas: NonNullable<CloseEditorControllerDocumentOptions['canvas']>;
} {
  return {
    canvas: { id: 'canvas' },
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setPanSession: vi.fn(),
    setSource: vi.fn(),
    setZoomLevel: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } as unknown as CloseEditorControllerDocumentOptions & {
    canvas: NonNullable<CloseEditorControllerDocumentOptions['canvas']>;
  };
}

function createApplyOptions(): ApplyEditorControllerDocumentOptions & {
  canvas: NonNullable<ApplyEditorControllerDocumentOptions['canvas']>;
} {
  return {
    applyOptions: { resetHistory: true, updateOriginal: true },
    applyToolMode: vi.fn(),
    canvas: { id: 'canvas' },
    document: {
      canvasHeight: 60,
      canvasWidth: 100,
      sourceHeight: 60,
      sourceWidth: 100,
    },
    hasHistory: false,
    options: { resetHistory: false, updateOriginal: false },
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    syncBackgroundLayer: vi.fn(async () => undefined),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } as unknown as ApplyEditorControllerDocumentOptions & {
    canvas: NonNullable<ApplyEditorControllerDocumentOptions['canvas']>;
  };
}

function runCloseCanvasParamsTest() {
  it('creates close canvas params without dropping controller state setters', () => {
    const options = createCloseOptions();
    const canvasOptions = createCloseEditorControllerCanvasOptions(options, options.canvas);

    expect(canvasOptions).toEqual({
      canvas: options.canvas,
      setActiveTool: options.setActiveTool,
      setCanvasDocumentSize: options.setCanvasDocumentSize,
      setCropState: options.setCropState,
      setDrawSession: options.setDrawSession,
      setHistory: options.setHistory,
      setOriginalDocument: options.setOriginalDocument,
      setPanSession: options.setPanSession,
      setSource: options.setSource,
      setZoomLevel: options.setZoomLevel,
      viewportDevicePixelRatioBaseline: 1,
      zoomLevel: options.zoomLevel,
    });
    expect(canvasOptions.setHistory).toBe(options.setHistory);
  });
}

function runApplyStateParamsTest() {
  it('normalizes apply state params through the shared builder', () => {
    const options = createApplyOptions();
    const stateOptions = createApplyEditorControllerDocumentStateOptions(options, options.canvas);

    expect(stateOptions).toEqual(
      expect.objectContaining({
        applyOptions: options.applyOptions,
        canvas: options.canvas,
        document: options.document,
        setActiveTool: options.setActiveTool,
        setCanvasDocumentSize: options.setCanvasDocumentSize,
        setCropState: options.setCropState,
        setHistory: options.setHistory,
        setOriginalDocument: options.setOriginalDocument,
        setSource: options.setSource,
        viewportDevicePixelRatioBaseline: 1,
      })
    );
    expect(stateOptions.prepareObject).toBe(options.prepareObject);
    expect(stateOptions.syncBackgroundLayer).toBe(options.syncBackgroundLayer);
  });
}

function runLegacyApplyOptionsTest() {
  it('uses legacy apply options when the modern field is absent', () => {
    const options = createApplyOptions();
    delete options.applyOptions;

    expect(createApplyEditorControllerDocumentSharedOptions(options).applyOptions).toEqual(
      options.options
    );
  });
}

function runEmptyApplyOptionsFallbackTest() {
  it('falls back to an empty applyOptions object when both inputs are absent', () => {
    const options = createApplyOptions();
    delete options.applyOptions;
    delete options.options;

    expect(createApplyEditorControllerDocumentSharedOptions(options).applyOptions).toEqual({});
  });
}

describe('editor-controller-document.params close/apply builders', () => {
  runCloseCanvasParamsTest();
  runApplyStateParamsTest();
  runLegacyApplyOptionsTest();
  runEmptyApplyOptionsFallbackTest();
});

describe('editor-controller-document.params prepared state builder', () => {
  it('creates prepared document state params from state options and prepared payload', () => {
    const options = createApplyOptions();
    const prepared = {
      browserFrame: { enabled: false, url: '' },
      canvasSize: { height: 300, width: 400 },
      frame: { backgroundMode: 'solid' },
      normalizedDocument: { id: 'doc-1' },
    } as never;

    expect(
      createPreparedEditorDocumentStateOptions({
        options: createApplyEditorControllerDocumentSharedOptions(options),
        prepared,
        source: { displayHeight: 300, displayWidth: 400, left: 10, top: 20 } as never,
      })
    ).toEqual(
      expect.objectContaining({
        applyOptions: options.applyOptions,
        prepared,
        setActiveTool: options.setActiveTool,
        setCanvasDocumentSize: options.setCanvasDocumentSize,
        setCropState: options.setCropState,
        setHistory: options.setHistory,
        setOriginalDocument: options.setOriginalDocument,
        setSource: options.setSource,
      })
    );
  });

  it('preserves a null source payload for downstream state application', () => {
    const options = createApplyOptions();
    const prepared = { normalizedDocument: { id: 'doc-2' } } as never;

    expect(
      createPreparedEditorDocumentStateOptions({
        options: createApplyEditorControllerDocumentSharedOptions(options),
        prepared,
        source: null,
      }).source
    ).toBeNull();
  });
});
