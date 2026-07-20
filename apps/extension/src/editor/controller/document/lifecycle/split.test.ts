import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  browserFrame: { title: 'Stored title', url: 'https://stored.example' },
  frame: {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#102030',
    backgroundGradientAngle: 22,
    backgroundGradientFrom: '#304050',
    backgroundGradientTo: '#607080',
    backgroundImageData: 'data:image/png;base64,background',
    backgroundImageFit: 'tile',
    backgroundMode: 'image',
    layoutMode: 'expand-canvas',
    paddingTop: 12,
    paddingRight: 34,
    paddingBottom: 56,
    paddingLeft: 78,
  },
  resetDocumentState: vi.fn(),
  setBrowserFrame: vi.fn(),
  setImageData: vi.fn(),
  setInspector: vi.fn(),
  setPageTitle: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  applyViewportZoomMock: vi.fn(),
  createBaseDocumentMock: vi.fn(async () => ({
    canvasHeight: 60,
    canvasWidth: 100,
    sourceHeight: 60,
    sourceImageData: 'source-data',
    sourceWidth: 100,
  })),
  logOpenTraceMock: vi.fn(),
  runApplyMock: vi.fn(async () => undefined),
  storeGetStateMock: vi.fn(() => storeState),
}));

vi.mock('../../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/useEditorStore')>()),
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

vi.mock('../runner', () => ({
  runApplyEditorControllerDocument: mocks.runApplyMock,
}));

vi.mock('..', async (importOriginal) => ({
  ...(await importOriginal<typeof import('..')>()),
  createBaseDocument: mocks.createBaseDocumentMock,
}));

vi.mock('../../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/debug')>()),
  logEditorOpenTrace: mocks.logOpenTraceMock,
}));

vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  applyEditorViewportZoom: mocks.applyViewportZoomMock,
}));

import { applyEditorControllerDocument } from './apply/run';
import { closeEditorControllerDocument } from './close/run';
import { openEditorControllerImage } from './open/image/run';
import { openLoadedEditorControllerDocument as loadEditorControllerDocument } from './open/load/run';

function createCanvas() {
  return {
    backgroundColor: 'black',
    backgroundImage: 'image',
    clear: vi.fn(),
    discardActiveObject: vi.fn(),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  } as any;
}

function createApplyControllerDocumentOptions() {
  return {
    applyToolMode: vi.fn(),
    canvas: createCanvas(),
    document: { id: 'doc' } as never,
    hasHistory: false,
    options: { resetHistory: true, updateOriginal: true },
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setSource: vi.fn(),
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } as const;
}

function registerApplyForwardingTest() {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('forwards apply requests into the document runner', async () => {
    const options = createApplyControllerDocumentOptions();
    await applyEditorControllerDocument(options);

    expect(mocks.runApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applyOptions: { resetHistory: true, updateOriginal: true },
        canvas: options.canvas,
        document: options.document,
        viewportDevicePixelRatioBaseline: 1,
        zoomLevel: 2,
      })
    );

    await applyEditorControllerDocument({
      ...options,
      applyOptions: { resetHistory: false, updateOriginal: false },
    });

    expect(mocks.runApplyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyOptions: { resetHistory: false, updateOriginal: false },
      })
    );

    const { options: _legacyOptions, ...optionsWithoutApplyState } = options;
    await applyEditorControllerDocument(optionsWithoutApplyState);

    expect(mocks.runApplyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyOptions: {},
      })
    );
  });
}

function registerOpenAndLoadTest() {
  it('opens and loads documents through the store-backed runtime seam', async () => {
    const applyDocument = vi.fn(async () => undefined);
    const scheduleZoomToFit = vi.fn();

    await openEditorControllerImage({
      applyDocument,
      dataUrl: 'data-url',
      openOptions: {},
      scheduleZoomToFit,
      sourceName: 'Source',
    });
    await loadEditorControllerDocument({
      applyDocument,
      document: {
        canvasHeight: 60,
        canvasWidth: 100,
        sourceHeight: 60,
        sourceImageData: 'loaded-data',
        sourceWidth: 100,
      } as never,
      scheduleZoomToFit,
    });

    expectOpenAndLoadState(applyDocument, scheduleZoomToFit);
  });
}

function expectOpenAndLoadState(
  applyDocument: ReturnType<typeof vi.fn>,
  scheduleZoomToFit: ReturnType<typeof vi.fn>
) {
  expect(mocks.createBaseDocumentMock).toHaveBeenCalledWith(
    'data-url',
    'Source',
    {
      ...storeState.frame,
      backgroundColor: 'transparent',
      backgroundGradientAngle: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
      backgroundGradientFrom: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom,
      backgroundGradientTo: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo,
      backgroundImageData: null,
      backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
      backgroundMode: 'color',
      layoutMode: 'fit-image',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
    },
    expect.objectContaining({ url: 'https://stored.example' })
  );
  expect(applyDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ canvasWidth: 100 }), {
    resetHistory: true,
    updateOriginal: true,
  });
  expect(applyDocument).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ sourceImageData: 'loaded-data' }),
    { resetHistory: true, updateOriginal: true }
  );
  expect(scheduleZoomToFit).toHaveBeenCalledTimes(2);
  expect(storeState.setInspector).toHaveBeenCalledWith('file');
  expect(storeState.setImageData).toHaveBeenCalledWith('loaded-data');
  expect(storeState.setPageTitle).toHaveBeenCalledWith('');
  expect(storeState.setBrowserFrame).toHaveBeenCalledWith({
    faviconDataUrl: null,
    title: '',
    url: 'https://stored.example',
  });
}

function registerCloseResetTest() {
  it('resets canvas state and handles missing canvases', () => {
    const canvas = createCanvas();

    closeEditorControllerDocument({
      canvas,
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
    } as any);
    closeEditorControllerDocument({ canvas: null, zoomLevel: 1 } as any);

    expect(mocks.applyViewportZoomMock).toHaveBeenCalledWith(canvas, { height: 0, width: 0 }, 2, 1);
    expect(storeState.resetDocumentState).toHaveBeenCalledTimes(2);
    expect(canvas.clear).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function runDocumentLifecycleSplitSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerApplyForwardingTest();
  registerOpenAndLoadTest();
  registerCloseResetTest();
}

describe('editor document lifecycle split seams', runDocumentLifecycleSplitSuite);
