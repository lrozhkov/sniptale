/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultEditorPresetStorageState } from '../../../composition/persistence/editor-presets';
const storeState = {
  activeTool: 'select',
  browserFrame: { title: 'Stored title', url: 'https://stored.example' },
  frame: { padding: 12 },
  resetDocumentState: vi.fn(),
  setBrowserFrame: vi.fn(),
  setCropReady: vi.fn(),
  setImageData: vi.fn(),
  setInspector: vi.fn(),
  setPageTitle: vi.fn(),
  toolSettings: {
    step: { alphabet: 'latin', color: '#ff671d', sizeLevel: 3, type: 'number', value: '1' },
  },
  workspace: { backgroundColor: '#445566' },
  updateStepSettings: vi.fn(),
  updateFrame: vi.fn(),
};
const mocks = vi.hoisted(() => ({
  applyViewportZoomMock: vi.fn(),
  createBaseDocumentMock: vi.fn(),
  ensureSourceLayerMock: vi.fn(),
  isFrameObjectMock: vi.fn((object: any) => object.role === 'frame'),
  loadEditorPresetStateMock: vi.fn(),
  logOpenTraceMock: vi.fn(),
  logSourceTraceMock: vi.fn(),
  prepareAppliedDocumentMock: vi.fn(),
  storeGetStateMock: vi.fn(() => storeState),
}));
vi.mock('../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/useEditorStore')>()),
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));
vi.mock('../../../composition/persistence/editor-presets', async () => {
  const actual = await vi.importActual<
    typeof import('../../../composition/persistence/editor-presets')
  >('../../../composition/persistence/editor-presets');

  return {
    ...actual,
    loadEditorPresetState: mocks.loadEditorPresetStateMock,
  };
});
vi.mock('./', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./')>()),
  createBaseDocument: mocks.createBaseDocumentMock,
  prepareAppliedDocument: mocks.prepareAppliedDocumentMock,
}));
vi.mock('../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/debug')>()),
  logEditorOpenTrace: mocks.logOpenTraceMock,
  logEditorSourceTrace: mocks.logSourceTraceMock,
}));
vi.mock('./source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source')>()),
  ensureEditorSourceLayer: mocks.ensureSourceLayerMock,
}));
vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  applyEditorViewportZoom: mocks.applyViewportZoomMock,
}));
vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isFrameObject: mocks.isFrameObjectMock,
}));

import { applyEditorDocumentToCanvas } from './apply';
import { applyEditorControllerDocument } from './lifecycle/apply/run';
import { closeEditorControllerDocument } from './lifecycle/close/run';
import { openEditorControllerImage } from './lifecycle/open/image/run';
import { openLoadedEditorControllerDocument as loadEditorControllerDocument } from './lifecycle/open/load/run';
import {
  createBrowserFrameRebuildDonePayload,
  createBrowserFrameRebuildPayload,
} from './lifecycle-helpers';
import { runApplyEditorControllerDocument } from './runner';
import { applyEditorControllerDocumentState } from './state';

function createPreparedDocument() {
  return {
    browserFrame: { title: 'Prepared browser frame' },
    canvasSize: { height: 60, width: 100 },
    frame: { padding: 4 },
    normalizedDocument: { canvasJson: '{"objects":[]}', canvasHeight: 60, canvasWidth: 100 },
    source: { displayHeight: 60, displayWidth: 100 },
  } as any;
}

function createCanvas() {
  const objects = [{ id: 'one' }, { id: 'two' }];
  return {
    backgroundColor: 'black',
    backgroundImage: 'image',
    clear: vi.fn(),
    discardActiveObject: vi.fn(),
    getObjects: vi.fn(() => objects),
    getElement: vi.fn(() => ({ style: { backgroundColor: '' } })),
    loadFromJSON: vi.fn(async () => undefined),
    requestRenderAll: vi.fn(),
    setDimensions: vi.fn(),
    setZoom: vi.fn(),
  } as any;
}

describe('editor document lifecycle coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadEditorPresetStateMock.mockResolvedValue(createDefaultEditorPresetStorageState());
  });

  it('applies editor documents to the canvas and prepares document state', async () => {
    const canvas = createCanvas(),
      prepared = createPreparedDocument();
    const source = {
      dataUrl: 'data:image/png;base64,source',
      displayHeight: 60,
      displayWidth: 100,
      intrinsicHeight: 60,
      intrinsicWidth: 100,
      name: 'Source',
      objectLeft: 0,
      objectScaleX: 1,
      objectScaleY: 1,
      objectTop: 0,
    } as any;
    mocks.prepareAppliedDocumentMock.mockReturnValue(prepared);
    mocks.ensureSourceLayerMock.mockResolvedValue(source);
    const prepareObject = vi.fn();
    const rebuildFrameDecorations = vi.fn(async () => undefined);

    const result = await applyEditorDocumentToCanvas({
      canvas,
      document: { id: 'document' } as never,
      prepareObject,
      rebuildFrameDecorations,
      upgradeLegacyArrowObjects: vi.fn(),
      zoomLevel: 2,
    });

    expect(result).toEqual({ prepared, source });
    expect(canvas.clear).not.toHaveBeenCalled();
    expect(canvas.backgroundImage).toBeUndefined();
    expect(canvas.backgroundColor).toBe('transparent');
    expect(canvas.setDimensions).toHaveBeenCalledWith({ height: 60, width: 100 });
    expect(mocks.applyViewportZoomMock).toHaveBeenCalledWith(
      canvas,
      { height: 60, width: 100 },
      2,
      undefined
    );
    expect(prepareObject).toHaveBeenCalledTimes(2);
    expect(rebuildFrameDecorations).toHaveBeenCalledOnce();
  });

  it('creates browser-frame payloads for rebuild tracing', () => {
    const canvas = createCanvas();
    expect(
      createBrowserFrameRebuildPayload({
        browserEnabled: true,
        canvas,
        canvasDocumentSize: { height: 40, width: 80 },
        renderToken: 3,
      })
    ).toEqual({
      browserEnabled: true,
      canvasHeight: 40,
      canvasWidth: 80,
      frameObjects: 0,
      renderToken: 3,
    } as never);
    expect(
      createBrowserFrameRebuildDonePayload({
        frameObjectsCount: 2,
        header: {
          getScaledHeight: () => 20,
          getScaledWidth: () => 50,
          left: 1,
          top: 2,
          visible: false,
        } as never,
        renderToken: 4,
      })
    ).toEqual({
      backgroundObjects: 2,
      headerHeight: 20,
      headerLeft: 1,
      headerTop: 2,
      headerVisible: false,
      headerWidth: 50,
      renderToken: 4,
    });
  });

  it('drives apply state and runner flows', async () => {
    const canvas = createCanvas();
    const prepared = createPreparedDocument();
    mocks.prepareAppliedDocumentMock.mockReturnValue(prepared);
    mocks.ensureSourceLayerMock.mockResolvedValue(null);

    const runOptions = {
      applyOptions: { resetHistory: true, updateOriginal: true },
      applyToolMode: vi.fn(),
      canvas,
      document: { id: 'doc' } as never,
      hasHistory: false,
      prepareObject: vi.fn(),
      rebuildFrameDecorations: vi.fn(async () => undefined),
      setActiveTool: vi.fn(),
      setCanvasDocumentSize: vi.fn(),
      setCropState: vi.fn(),
      setHistory: vi.fn(),
      setOriginalDocument: vi.fn(),
      setSource: vi.fn(),
      syncRuntimeState: vi.fn(),
      zoomLevel: 2,
    } as any;

    await applyEditorControllerDocumentState(runOptions);
    await runApplyEditorControllerDocument(runOptions);
    await runApplyEditorControllerDocument({ ...runOptions, canvas: null });

    expect(runOptions.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('opens, loads, closes, and applies controller documents', async () => {
    const canvas = createCanvas();
    const document = {
      canvasHeight: 60,
      canvasWidth: 100,
      sourceHeight: 60,
      sourceImageData: 'data',
      sourceWidth: 100,
    } as any;
    mocks.createBaseDocumentMock.mockResolvedValue(document);
    const applyDocument = vi.fn(async () => undefined);
    const scheduleZoomToFit = vi.fn();

    await openEditorControllerImage({
      applyDocument,
      dataUrl: 'data-url',
      openOptions: { browserFrameUrl: 'https://page.example', pageTitle: 'Page' },
      scheduleZoomToFit,
      sourceName: 'Source',
    });
    await loadEditorControllerDocument({ applyDocument, document, scheduleZoomToFit });
    await applyEditorControllerDocument({
      applyToolMode: vi.fn(),
      canvas,
      document,
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
      zoomLevel: 2,
    });

    expect(applyDocument).toHaveBeenCalled();
    expect(scheduleZoomToFit).toHaveBeenCalledTimes(2);
    expect(storeState.setInspector).toHaveBeenCalledWith('file');
    expect(storeState.setImageData).toHaveBeenCalled();
    expect(storeState.setPageTitle).toHaveBeenCalledWith('Page');

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
      zoomLevel: 2,
    } as any);
    closeEditorControllerDocument({ canvas: null, zoomLevel: 1 } as any);

    expect(storeState.resetDocumentState).toHaveBeenCalledTimes(2);
    expect(canvas.clear).toHaveBeenCalled();
  });
});
