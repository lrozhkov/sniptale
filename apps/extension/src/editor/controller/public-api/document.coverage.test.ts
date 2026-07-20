import { beforeEach, expect, it, vi } from 'vitest';

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
  copyRenderedEditorImageViaController,
  exportEditorDocumentViaController,
  renderEditorControllerToDataUrl,
} from './document/export';
import {
  redoEditorControllerSnapshot,
  resetEditorControllerToOriginal,
  undoEditorControllerSnapshot,
} from './document/history';
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

beforeEach(() => {
  vi.clearAllMocks();
});

it('bridges document open, load, close, export, render, and copy flows', async () => {
  const controller = createController();

  await openEditorImageViaController(controller, 'data-url', 'Name', { pageTitle: 'Page' });
  await loadEditorDocumentViaController(controller, { id: 'document' } as never);
  closeEditorDocumentViaController(controller);
  expect(exportEditorDocumentViaController(controller)).toEqual({ id: 'exported' });
  expect(renderEditorControllerToDataUrl(controller, { format: 'png', quality: 0.8 })).toBe(
    'data-url'
  );
  await copyRenderedEditorImageViaController(controller, {
    outputSize: { width: 640, height: 360 },
  });
  applyEditorSelectionSettingsViaController(controller);
  previewEditorSelectionSettingsViaController(controller);

  expect(mocks.openImageMock).toHaveBeenCalledWith(
    expect.objectContaining({ dataUrl: 'data-url', sourceName: 'Name' })
  );
  expect(mocks.loadDocumentMock).toHaveBeenCalledOnce();
  expect(mocks.closeDocumentMock).toHaveBeenCalledWith(
    expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
  );
  expect(mocks.syncSourceStateMock).toHaveBeenCalledWith({ id: 'source' }, 'source-object');
  expect(mocks.buildDocumentMock).toHaveBeenCalledOnce();
  expect(mocks.copyRenderedMock).toHaveBeenCalledWith({
    dataUrl: 'rendered',
    mimeType: 'image/png',
  });
  expect(controller.renderToDataUrl).toHaveBeenCalledWith({
    format: 'png',
    outputSize: { height: 360, width: 640 },
    quality: 0.9,
  });
  expect(mocks.applySelectionSettingsMock).toHaveBeenCalledOnce();
  expect(mocks.previewSelectionSettingsMock).toHaveBeenCalledOnce();
});

it('applies history documents only when a snapshot exists', async () => {
  const controller = createController();

  await undoEditorControllerSnapshot(controller);
  await redoEditorControllerSnapshot(controller);
  await resetEditorControllerToOriginal(controller);

  mocks.undoMock.mockReturnValueOnce(null as any);
  mocks.redoMock.mockReturnValueOnce(null as any);
  controller.originalDocument = null;
  await undoEditorControllerSnapshot(controller);
  await redoEditorControllerSnapshot(controller);
  await resetEditorControllerToOriginal(controller);

  expect(controller.applyDocument).toHaveBeenCalledWith(
    { id: 'undo' },
    { resetHistory: false, updateOriginal: false }
  );
  expect(controller.applyDocument).toHaveBeenCalledWith(
    { id: 'redo' },
    { resetHistory: false, updateOriginal: false }
  );
  expect(controller.applyDocument).toHaveBeenCalledWith(
    { id: 'original' },
    { resetHistory: true, updateOriginal: true }
  );
  expect(controller.applyDocument).toHaveBeenCalledTimes(3);
});
