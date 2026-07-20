import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actionMock: vi.fn(),
  applyBrowserFrameMock: vi.fn(),
  applyDocumentMock: vi.fn(),
  applyFrameMock: vi.fn(),
  applySelectionSettingsMock: vi.fn(),
  buildDocumentMock: vi.fn(() => ({ id: 'document' })),
  closeDocumentMock: vi.fn(),
  copyRenderedMock: vi.fn(),
  getSourceObjectMock: vi.fn(() => 'source-object'),
  loadDocumentMock: vi.fn(),
  loadEditorExportSettingsMock: vi.fn(async () => ({ imageFormat: 'png', imageQuality: 0.9 })),
  openImageMock: vi.fn(),
  redoMock: vi.fn(() => ({ id: 'redo' })),
  removeBrowserFrameMock: vi.fn(),
  renderToDataUrlMock: vi.fn(() => 'data-url'),
  resizeCanvasMock: vi.fn(),
  resizeSourceSceneMock: vi.fn(),
  resolveMimeTypeMock: vi.fn(() => 'image/png'),
  storeGetStateMock: vi.fn(() => ({
    browserFrame: { url: 'https://example.com' },
    frame: { size: 'frame' },
  })),
  syncSourceStateMock: vi.fn(() => ({ synced: true })),
  undoMock: vi.fn(() => ({ id: 'undo' })),
}));

vi.mock('../../state/useEditorStore', () => ({
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

vi.mock('../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions')>()),
  applyEditorBrowserFrameSettings: mocks.applyBrowserFrameMock,
  applyEditorFrameSceneSettings: mocks.applyFrameMock,
  applyEditorSelectionSettings: mocks.applySelectionSettingsMock,
  deleteEditorSelection: mocks.actionMock,
  duplicateEditorSelection: mocks.actionMock,
  insertEditorImageObject: mocks.actionMock,
  insertEditorTechnicalDataObject: mocks.actionMock,
  removeEditorBrowserFrameSettings: mocks.removeBrowserFrameMock,
  renameEditorLayerById: mocks.actionMock,
  reorderEditorLayer: mocks.actionMock,
  resizeEditorCanvasScene: mocks.resizeCanvasMock,
  resizeEditorLayerById: mocks.actionMock,
  resizeEditorSourceScene: mocks.resizeSourceSceneMock,
  selectEditorLayerById: mocks.actionMock,
  toggleEditorLayerLockState: mocks.actionMock,
  toggleEditorLayerVisibility: mocks.actionMock,
}));
vi.mock('../layer-effects/merge', () => ({ mergeEditorSelectedLayers: mocks.actionMock }));
vi.mock('../layer-effects/raster-mutations/effects', () => ({
  applyEditorLayerRasterEffect: mocks.actionMock,
  previewEditorLayerRasterEffect: mocks.actionMock,
  removeEditorLayerRasterEffect: mocks.actionMock,
  resetEditorLayerRasterEffectPreview: mocks.actionMock,
  updateEditorLayerRasterEffect: mocks.actionMock,
}));
vi.mock('../layer-effects/raster-mutations/resize', () => ({
  resizeEditorLayerWithRasterize: mocks.actionMock,
}));
vi.mock('../layer-effects/raster-mutations/transform', () => ({
  applyEditorLayerTransformation: mocks.actionMock,
}));
vi.mock('../history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../history')>()),
  redoEditorSnapshot: mocks.redoMock,
  undoEditorSnapshot: mocks.undoMock,
}));

vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  getSourceObject: mocks.getSourceObjectMock,
}));

vi.mock('../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/source')>()),
  syncSourceStateFromObject: mocks.syncSourceStateMock,
}));

vi.mock('../../persistence/export-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/export-settings')>()),

  loadEditorExportSettings: mocks.loadEditorExportSettingsMock,
}));

import {
  applyEditorControllerLayerEffect,
  applyEditorControllerLayerTransformation,
  applyEditorControllerBrowserFrame,
  applyEditorControllerFrame,
  applyEditorSelectionSettingsViaController,
  closeEditorDocumentViaController,
  copyRenderedEditorImageViaController,
  deleteEditorControllerSelection,
  duplicateEditorControllerSelection,
  exportEditorDocumentViaController,
  insertEditorControllerImage,
  insertEditorControllerTechnicalData,
  loadEditorDocumentViaController,
  mergeEditorControllerSelectedLayers,
  openEditorImageViaController,
  redoEditorControllerSnapshot,
  removeEditorControllerLayerEffect,
  renameEditorControllerLayer,
  renderEditorControllerToDataUrl,
  reorderEditorControllerLayer,
  resizeEditorControllerCanvas,
  resizeEditorControllerImageScene,
  resizeEditorControllerLayer,
  resetEditorControllerToOriginal,
  selectEditorControllerLayer,
  toggleEditorControllerLayerLock,
  toggleEditorControllerLayerVisibility,
  undoEditorControllerSnapshot,
  updateEditorControllerLayerEffect,
} from './';

function createController() {
  const controller = {
    applyDocument: vi.fn(async (document) => {
      controller.lastApplied = document;
    }),
    canvas: { id: 'canvas' },
    canvasDocumentSize: { height: 80, width: 120 },
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    ensureObjectReachable: vi.fn(),
    ensureReachableObjects: vi.fn(),
    focusObjectInViewport: vi.fn(),
    history: { id: 'history' },
    logBrowserFrame: vi.fn(),
    nextLabelIndex: vi.fn(() => 2),
    originalDocument: { id: 'original' },
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(),
    relayoutScene: vi.fn(),
    renderToDataUrl: vi.fn(() => 'rendered'),
    scheduleZoomToFit: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setLastLayerSelectionAnchorId: vi.fn(),
    setActiveTool: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    setHistory: vi.fn(),
    setOriginalDocument: vi.fn(),
    setPanSession: vi.fn(),
    setSource: vi.fn((source) => {
      controller.source = source;
    }),
    setZoomLevel: vi.fn(),
    source: { name: 'capture.png', source: true },
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    withHistoryMuted: vi.fn((callback) => callback()),
    zoomLevel: 2,
    createLayerMutationToken: vi.fn(() => 1),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    lastLayerSelectionAnchorId: 'layer-anchor',
  } as any;

  return controller;
}

it('forwards selection and layer operations into public actions', async () => {
  const controller = createController();

  deleteEditorControllerSelection(controller);
  await duplicateEditorControllerSelection(controller);
  reorderEditorControllerLayer(controller, 'dragged', 'target');
  selectEditorControllerLayer(controller, 'layer-1', { focusViewport: true, toggle: true });
  renameEditorControllerLayer(controller, 'layer-1', 'Renamed');
  toggleEditorControllerLayerVisibility(controller, 'layer-1');
  toggleEditorControllerLayerLock(controller, 'layer-1');
  resizeEditorControllerLayer(controller, 'layer-1', 10, 20);
  await mergeEditorControllerSelectedLayers(controller);
  await applyEditorControllerLayerEffect(controller, 'layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  await updateEditorControllerLayerEffect(controller, 'layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  removeEditorControllerLayerEffect(controller, 'layer-1', 'brightness');
  await applyEditorControllerLayerTransformation(controller, 'layer-1', 'rotate-left');
  await insertEditorControllerImage(controller, 'data-url', 'Image');
  insertEditorControllerTechnicalData(controller, ['url']);
  applyEditorSelectionSettingsViaController(controller);

  expect(mocks.actionMock).toHaveBeenCalled();
  expect(mocks.applySelectionSettingsMock).toHaveBeenCalled();
});

it('bridges document export, render, and history flows', async () => {
  const controller = createController();

  await openEditorImageViaController(controller, 'data-url', 'Name', { pageTitle: 'Page' });
  await loadEditorDocumentViaController(controller, { id: 'document' } as never);
  closeEditorDocumentViaController(controller);
  expect(exportEditorDocumentViaController(controller)).toEqual({ id: 'document' });
  expect(renderEditorControllerToDataUrl(controller, { format: 'png', quality: 0.8 })).toBe(
    'data-url'
  );
  await copyRenderedEditorImageViaController(controller, {
    outputSize: { width: 640, height: 360 },
  });
  await undoEditorControllerSnapshot(controller);
  await redoEditorControllerSnapshot(controller);
  await resetEditorControllerToOriginal(controller);

  expect(mocks.openImageMock).toHaveBeenCalled();
  expect(mocks.loadDocumentMock).toHaveBeenCalled();
  expect(mocks.closeDocumentMock).toHaveBeenCalledWith(
    expect.objectContaining({ viewportDevicePixelRatioBaseline: 1 })
  );
  expect(mocks.syncSourceStateMock).toHaveBeenCalledWith(
    expect.objectContaining({ source: true }),
    'source-object'
  );
  expect(mocks.copyRenderedMock).toHaveBeenCalledWith({
    dataUrl: 'rendered',
    mimeType: 'image/png',
  });
  expect(controller.renderToDataUrl).toHaveBeenCalledWith({
    format: 'png',
    outputSize: { height: 360, width: 640 },
    quality: 0.9,
  });
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
});

it('forwards scene actions through the scene public api wrappers', async () => {
  const controller = createController();

  resizeEditorControllerCanvas(controller, 100, 50);
  resizeEditorControllerImageScene(controller, 120, 80);
  await Promise.resolve();
  await Promise.resolve();
  applyEditorControllerFrame(controller, { padding: 8 } as never);
  await applyEditorControllerBrowserFrame(controller, { enabled: true } as never);

  expect(mocks.resizeCanvasMock).toHaveBeenCalled();
  expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  expect(controller.renderToDataUrl).toHaveBeenCalledWith({
    format: 'png',
    outputSize: { height: 80, width: 120 },
    quality: 1,
  });
  expect(controller.applyDocument).toHaveBeenCalledWith(
    expect.objectContaining({
      canvasHeight: 80,
      canvasWidth: 120,
      sourceHeight: 80,
      sourceImageData: 'rendered',
      sourceName: 'capture.png',
      sourceWidth: 120,
    }),
    {}
  );
  expect(mocks.applyFrameMock).toHaveBeenCalled();
  expect(mocks.applyBrowserFrameMock).toHaveBeenCalled();
});
