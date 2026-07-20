import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState = {
  browserFrame: { url: 'https://example.com' },
  frame: { padding: 8 },
};

const mocks = vi.hoisted(() => ({
  applySelectionSettingsMock: vi.fn(),
  previewSelectionSettingsMock: vi.fn(),
  buildDocumentMock: vi.fn(() => ({ id: 'exported' })),
  closeDocumentMock: vi.fn(),
  copyRenderedMock: vi.fn(async () => undefined),
  getSourceObjectMock: vi.fn(() => 'source-object'),
  loadDocumentMock: vi.fn(async () => undefined),
  loadEditorExportSettingsMock: vi.fn(async () => ({ imageFormat: 'png', imageQuality: 0.9 })),
  openImageMock: vi.fn(async () => undefined),
  redoMock: vi.fn(() => ({ id: 'redo' })),
  renderToDataUrlMock: vi.fn(() => 'data-url'),
  resolveMimeTypeMock: vi.fn(() => 'image/png'),
  storeGetStateMock: vi.fn(() => storeState),
  syncSourceStateMock: vi.fn(() => ({ synced: true })),
  undoMock: vi.fn(() => ({ id: 'undo' })),
}));

vi.mock('../../state/useEditorStore', () => ({
  EditorInspector: undefined,
  EditorState: undefined,
  useEditorStore: { getState: mocks.storeGetStateMock },
}));

vi.mock('../document/export', () => ({
  buildEditorCanvasDocument: mocks.buildDocumentMock,
  copyEditorRenderedImage: mocks.copyRenderedMock,
  renderEditorCanvasToDataUrl: mocks.renderToDataUrlMock,
  resolveEditorImageMimeType: mocks.resolveMimeTypeMock,
}));

vi.mock('../document/lifecycle/close/run', () => ({
  closeEditorControllerDocument: mocks.closeDocumentMock,
}));

vi.mock('../document/lifecycle/open/load/run', () => ({
  openLoadedEditorControllerDocument: mocks.loadDocumentMock,
}));

vi.mock('../document/lifecycle/open/image/run', () => ({
  openEditorControllerImage: mocks.openImageMock,
}));

vi.mock('../public-actions', () => ({
  applyEditorBrowserFrameSettings: vi.fn(),
  applyEditorFrameSceneSettings: vi.fn(),
  applyEditorSelectionSettings: mocks.applySelectionSettingsMock,
  deleteEditorSelection: vi.fn(),
  duplicateEditorSelection: vi.fn(),
  insertEditorImageObject: vi.fn(),
  insertEditorTechnicalDataObject: vi.fn(),
  nudgeEditorSelection: vi.fn(),
  previewEditorBrowserFrameSettings: vi.fn(),
  previewRemoveEditorBrowserFrameSettings: vi.fn(),
  removeEditorBrowserFrameSettings: vi.fn(),
  renameEditorLayerById: vi.fn(),
  reorderEditorLayer: vi.fn(),
  resizeEditorCanvasScene: vi.fn(),
  resizeEditorLayerById: vi.fn(),
  resizeEditorSourceScene: vi.fn(),
  selectEditorLayerById: vi.fn(),
  toggleEditorLayerLockState: vi.fn(),
  toggleEditorLayerVisibility: vi.fn(),
}));

vi.mock('../public-actions/selection/objects/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions/selection/objects/settings')>()),
  previewEditorSelectionSettings: mocks.previewSelectionSettingsMock,
}));

vi.mock('../history', () => ({
  createEditorSnapshotHistory: vi.fn(),
  pushEditorSnapshotHistory: vi.fn(),
  redoEditorSnapshot: mocks.redoMock,
  undoEditorSnapshot: mocks.undoMock,
}));

vi.mock('../document/layers', () => ({
  collectLayers: vi.fn(),
  findObjectById: vi.fn(),
  getLayerObjects: vi.fn(),
  getObjectDimensions: vi.fn(),
  getSourceObject: mocks.getSourceObjectMock,
}));

vi.mock('../document/source', () => ({
  ensureEditorSourceLayer: vi.fn(),
  syncSourceStateFromObject: mocks.syncSourceStateMock,
}));

vi.mock('../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/export-settings')>()),

  loadEditorExportSettings: mocks.loadEditorExportSettingsMock,
}));

import {
  closeEditorDocumentViaController,
  loadEditorDocumentViaController,
  openEditorImageViaController,
} from './document/lifecycle';
import {
  applyEditorSelectionSettingsViaController,
  previewEditorSelectionSettingsViaController,
} from './document/selection';

function createController() {
  return {
    applyDocument: vi.fn(async () => undefined),
    canvas: { id: 'canvas' },
    canvasDocumentSize: { height: 80, width: 120 },
    commitHistory: vi.fn(),
    history: { id: 'history' },
    originalDocument: { id: 'original' },
    renderToDataUrl: vi.fn(() => 'rendered'),
    scheduleZoomToFit: vi.fn(),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setPanSession: vi.fn(),
    setSource: vi.fn(),
    setZoomLevel: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    withHistoryMuted: vi.fn((callback) => callback()),
    zoomLevel: 2,
  } as any;
}

function expectMockArgs<T>(calls: T[][], index: number, label: string): T {
  const call = calls[index];
  const args = call?.[0];
  if (!args) {
    throw new Error(`Expected ${label}`);
  }

  return args;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function registerOpenAndLoadCallbackTest() {
  it('forwards open and load callbacks back into the controller', async () => {
    const controller = createController();

    await openEditorImageViaController(controller, 'data-url', 'Name', { pageTitle: 'Page' });
    await loadEditorDocumentViaController(controller, { id: 'document' } as never);

    const openArgs = expectMockArgs(
      mocks.openImageMock.mock.calls as any[][],
      0,
      'open-image args'
    );
    await openArgs.applyDocument(
      { id: 'open-doc' },
      { resetHistory: false, updateOriginal: false }
    );
    openArgs.scheduleZoomToFit();

    const loadArgs = expectMockArgs(
      mocks.loadDocumentMock.mock.calls as any[][],
      0,
      'load-document args'
    );
    await loadArgs.applyDocument(
      { id: 'load-doc' },
      { resetHistory: false, updateOriginal: false }
    );
    loadArgs.scheduleZoomToFit();

    expect(controller.applyDocument).toHaveBeenCalledWith(
      { id: 'open-doc' },
      { resetHistory: false, updateOriginal: false }
    );
    expect(controller.applyDocument).toHaveBeenCalledWith(
      { id: 'load-doc' },
      { resetHistory: false, updateOriginal: false }
    );
    expect(controller.scheduleZoomToFit).toHaveBeenCalledTimes(2);
  });
}

function registerCloseSetterCallbackTest() {
  it('forwards close setter callbacks', () => {
    const controller = createController();

    closeEditorDocumentViaController(controller);

    const closeArgs = expectMockArgs(
      mocks.closeDocumentMock.mock.calls as any[][],
      0,
      'close-document args'
    );
    expect(closeArgs.viewportDevicePixelRatioBaseline).toBe(1);
    closeArgs.setCanvasDocumentSize({ height: 10, width: 20 });
    closeArgs.setDrawSession(null);
    closeArgs.setCropState(null, null);
    closeArgs.setSource({ id: 'next-source' });
    closeArgs.setOriginalDocument({ id: 'next-original' });
    closeArgs.setHistory(null);
    closeArgs.setActiveTool('select');
    closeArgs.setZoomLevel(1);
    closeArgs.setPanSession(null);

    expect(controller.setCanvasDocumentSize).toHaveBeenCalledWith({ height: 10, width: 20 });
    expect(controller.setDrawSession).toHaveBeenCalledWith(null);
    expect(controller.setCropState).toHaveBeenCalledWith(null, null);
    expect(controller.setSource).toHaveBeenCalledWith({ id: 'next-source' });
    expect(controller.setOriginalDocument).toHaveBeenCalledWith({ id: 'next-original' });
    expect(controller.setHistory).toHaveBeenCalledWith(null);
    expect(controller.setActiveTool).toHaveBeenCalledWith('select');
    expect(controller.setZoomLevel).toHaveBeenCalledWith(1);
    expect(controller.setPanSession).toHaveBeenCalledWith(null);
  });
}

function registerSelectionHistoryCallbackTest() {
  it('forwards selection-setting history callbacks', () => {
    const controller = createController();

    applyEditorSelectionSettingsViaController(controller);
    previewEditorSelectionSettingsViaController(controller);

    const selectionArgs = expectMockArgs(
      mocks.applySelectionSettingsMock.mock.calls as any[][],
      0,
      'selection settings args'
    );
    selectionArgs.withHistoryMuted(() => undefined);
    selectionArgs.commitHistory();
    selectionArgs.syncRuntimeState();
    const previewArgs = expectMockArgs(
      mocks.previewSelectionSettingsMock.mock.calls as any[][],
      0,
      'preview selection settings args'
    );
    previewArgs.withHistoryMuted(() => undefined);
    previewArgs.syncRuntimeState();
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);
  });
}

function runDocumentCallbackBridgeSuite() {
  registerOpenAndLoadCallbackTest();
  registerCloseSetterCallbackTest();
  registerSelectionHistoryCallbackTest();
}

describe('public-api document callback bridges', runDocumentCallbackBridgeSuite);
