import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorBrowserFrameSettingsMock: vi.fn(),
  applyEditorFrameSceneSettingsMock: vi.fn(),
  previewEditorBrowserFrameSettingsMock: vi.fn(),
  previewRemoveEditorBrowserFrameSettingsMock: vi.fn(),
  applyEditorSelectionSettingsMock: vi.fn(),
  createInsertedImageObjectMock: vi.fn(),
  createTechnicalDataTextObjectMock: vi.fn(),
  deleteEditorSelectionMock: vi.fn(),
  nudgeEditorSelectionMock: vi.fn(),
  getStateMock: vi.fn(() => ({
    browserFrame: { url: ' https://example.test/path ' },
    pageTitle: ' Example title ',
    setInspector: vi.fn(),
    toolSettings: { text: { calloutFormat: 'panel' } },
  })),
  removeEditorBrowserFrameSettingsMock: vi.fn(),
  renameEditorLayerByIdMock: vi.fn(),
  reorderEditorLayerMock: vi.fn(),
  resizeEditorCanvasSceneMock: vi.fn(),
  resizeEditorLayerByIdMock: vi.fn(),
  resizeEditorSourceSceneMock: vi.fn(),
  selectEditorLayerByIdMock: vi.fn(),
  toggleEditorLayerLockStateMock: vi.fn(),
  toggleEditorLayerVisibilityMock: vi.fn(),
  duplicateEditorSelectionMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/useEditorStore')>()),
  useEditorStore: {
    getState: mocks.getStateMock,
  },
}));

vi.mock('../tools/insertions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/insertions')>()),
  createInsertedImageObject: mocks.createInsertedImageObjectMock,
  createTechnicalDataTextObject: mocks.createTechnicalDataTextObjectMock,
}));

vi.mock('./selection', () => ({
  applyEditorSelectionSettings: mocks.applyEditorSelectionSettingsMock,
  deleteEditorSelection: mocks.deleteEditorSelectionMock,
  duplicateEditorSelection: mocks.duplicateEditorSelectionMock,
  nudgeEditorSelection: mocks.nudgeEditorSelectionMock,
  reorderEditorLayer: mocks.reorderEditorLayerMock,
  renameEditorLayerById: mocks.renameEditorLayerByIdMock,
  resizeEditorLayerById: mocks.resizeEditorLayerByIdMock,
  selectEditorLayerById: mocks.selectEditorLayerByIdMock,
  toggleEditorLayerLockState: mocks.toggleEditorLayerLockStateMock,
  toggleEditorLayerVisibility: mocks.toggleEditorLayerVisibilityMock,
}));

vi.mock('./scene', () => ({
  applyEditorBrowserFrameSettings: mocks.applyEditorBrowserFrameSettingsMock,
  applyEditorFrameSceneSettings: mocks.applyEditorFrameSceneSettingsMock,
  previewEditorBrowserFrameSettings: mocks.previewEditorBrowserFrameSettingsMock,
  previewRemoveEditorBrowserFrameSettings: mocks.previewRemoveEditorBrowserFrameSettingsMock,
  removeEditorBrowserFrameSettings: mocks.removeEditorBrowserFrameSettingsMock,
  resizeEditorCanvasScene: mocks.resizeEditorCanvasSceneMock,
  resizeEditorSourceScene: mocks.resizeEditorSourceSceneMock,
}));

import {
  applyEditorBrowserFrameSettings,
  applyEditorFrameSceneSettings,
  applyEditorSelectionSettings,
  deleteEditorSelection,
  duplicateEditorSelection,
  insertEditorImageObject,
  insertEditorTechnicalDataObject,
  nudgeEditorSelection,
  previewEditorBrowserFrameSettings,
  previewRemoveEditorBrowserFrameSettings,
  removeEditorBrowserFrameSettings,
  renameEditorLayerById,
  reorderEditorLayer,
  resizeEditorCanvasScene,
  resizeEditorLayerById,
  resizeEditorSourceScene,
  selectEditorLayerById,
  toggleEditorLayerLockState,
  toggleEditorLayerVisibility,
} from './';

function createCanvas() {
  return {
    add: vi.fn(),
    getHeight: vi.fn(() => 360),
    getWidth: vi.fn(() => 640),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function createImageOptions() {
  return {
    commitHistory: vi.fn(),
    dataUrl: 'data:image/png;base64,abc',
    name: 'capture.png',
    nextLabelIndex: vi.fn(() => 4),
    prepareObject: vi.fn(),
    source: {
      dataUrl: 'data:image/png;base64,source',
      displayHeight: 200,
      displayWidth: 300,
      id: 'source-image-layer',
      intrinsicHeight: 200,
      intrinsicWidth: 300,
      left: 0,
      locked: true,
      name: 'source',
      top: 0,
      visible: true,
    },
    syncRuntimeState: vi.fn(),
  };
}

function setupPublicActionMocks() {
  vi.clearAllMocks();
  mocks.getStateMock.mockReturnValue({
    browserFrame: { url: ' https://example.test/path ' },
    pageTitle: ' Example title ',
    setInspector: vi.fn(),
    toolSettings: { text: { calloutFormat: 'panel' } },
  });
}

function runNoopInsertionSuite() {
  it('no-ops image and technical-data insertions when the canvas source is unavailable', async () => {
    const imageOptions = createImageOptions();

    await insertEditorImageObject({
      ...imageOptions,
      canvas: null,
    });
    insertEditorTechnicalDataObject({
      canvas: null,
      commitHistory: vi.fn(),
      kinds: ['browser'],
      nextLabelIndex: vi.fn(() => 2),
      prepareObject: vi.fn(),
      source: null,
      syncRuntimeState: vi.fn(),
    });

    expect(mocks.createInsertedImageObjectMock).not.toHaveBeenCalled();
    expect(mocks.createTechnicalDataTextObjectMock).not.toHaveBeenCalled();
  });
}

function runImageInsertionSuite() {
  it('inserts image objects and syncs the editor runtime', async () => {
    const canvas = createCanvas();
    const image = { id: 'image' };
    const options = createImageOptions();

    mocks.createInsertedImageObjectMock.mockResolvedValue(image);

    await insertEditorImageObject({
      ...options,
      canvas: canvas as never,
    });

    expect(mocks.createInsertedImageObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasHeight: 360,
        canvasWidth: 640,
        dataUrl: 'data:image/png;base64,abc',
        nextLabelIndex: 4,
      })
    );
    expect(canvas.add).toHaveBeenCalledWith(image);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(image);
    expect(options.commitHistory).toHaveBeenCalledOnce();
    expect(options.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runTechnicalDataSuite() {
  it('inserts technical data as text and switches the inspector back to tool', () => {
    const canvas = createCanvas();
    const text = { id: 'text' };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    const setInspector = vi.fn();

    mocks.getStateMock.mockReturnValue({
      browserFrame: { url: ' https://example.test/path ' },
      pageTitle: ' Example title ',
      setInspector,
      toolSettings: { text: { calloutFormat: 'panel' } },
    });
    mocks.createTechnicalDataTextObjectMock.mockReturnValue(text);

    insertEditorTechnicalDataObject({
      canvas: canvas as never,
      commitHistory,
      kinds: ['browser', 'url'],
      layout: 'row',
      nextLabelIndex: vi.fn(() => 7),
      prepareObject: vi.fn(),
      source: createImageOptions().source,
      syncRuntimeState,
    });

    expect(mocks.createTechnicalDataTextObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ['browser', 'url'],
        layout: 'row',
        nextLabelIndex: 7,
        sourceTitle: 'Example title',
        sourceUrl: 'https://example.test/path',
        textSettings: expect.any(Object),
      })
    );
    expect(canvas.add).toHaveBeenCalledWith(text);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(text);
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(setInspector).toHaveBeenCalledWith('tool');
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runReExportSuite() {
  it('re-exports selection and scene action seams from the public-actions root', () => {
    applyEditorSelectionSettings({ id: 'selection' } as never);
    deleteEditorSelection({ id: 'delete' } as never);
    duplicateEditorSelection({ id: 'duplicate' } as never);
    nudgeEditorSelection({ id: 'nudge' } as never);
    reorderEditorLayer({ id: 'reorder' } as never);
    renameEditorLayerById({ id: 'rename' } as never);
    resizeEditorLayerById({ id: 'resize-layer' } as never);
    selectEditorLayerById({ id: 'select' } as never);
    toggleEditorLayerLockState({ id: 'lock' } as never);
    toggleEditorLayerVisibility({ id: 'visibility' } as never);
    resizeEditorCanvasScene({ id: 'canvas' } as never);
    resizeEditorSourceScene({ id: 'source' } as never);
    applyEditorFrameSceneSettings({ id: 'frame' } as never);
    applyEditorBrowserFrameSettings({ id: 'browser' } as never);
    previewEditorBrowserFrameSettings({ id: 'browser-preview' } as never);
    removeEditorBrowserFrameSettings({ id: 'remove-browser' } as never);
    previewRemoveEditorBrowserFrameSettings({ id: 'remove-browser-preview' } as never);

    expect(mocks.applyEditorSelectionSettingsMock).toHaveBeenCalled();
    expect(mocks.deleteEditorSelectionMock).toHaveBeenCalled();
    expect(mocks.duplicateEditorSelectionMock).toHaveBeenCalled();
    expect(mocks.nudgeEditorSelectionMock).toHaveBeenCalled();
    expect(mocks.reorderEditorLayerMock).toHaveBeenCalled();
    expect(mocks.renameEditorLayerByIdMock).toHaveBeenCalled();
    expect(mocks.resizeEditorLayerByIdMock).toHaveBeenCalled();
    expect(mocks.selectEditorLayerByIdMock).toHaveBeenCalled();
    expect(mocks.toggleEditorLayerLockStateMock).toHaveBeenCalled();
    expect(mocks.toggleEditorLayerVisibilityMock).toHaveBeenCalled();
    expect(mocks.resizeEditorCanvasSceneMock).toHaveBeenCalled();
    expect(mocks.resizeEditorSourceSceneMock).toHaveBeenCalled();
    expect(mocks.applyEditorFrameSceneSettingsMock).toHaveBeenCalled();
    expect(mocks.applyEditorBrowserFrameSettingsMock).toHaveBeenCalled();
    expect(mocks.previewEditorBrowserFrameSettingsMock).toHaveBeenCalled();
    expect(mocks.removeEditorBrowserFrameSettingsMock).toHaveBeenCalled();
    expect(mocks.previewRemoveEditorBrowserFrameSettingsMock).toHaveBeenCalled();
  });
}

describe('editor-controller-public-actions', () => {
  beforeEach(setupPublicActionMocks);
  runNoopInsertionSuite();
  runImageInsertionSuite();
  runTechnicalDataSuite();
  runReExportSuite();
});
