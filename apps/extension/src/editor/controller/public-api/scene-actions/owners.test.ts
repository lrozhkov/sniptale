import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';

const storeState = {
  browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE },
  frame: { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 8 },
  setBrowserFrame: vi.fn(),
  updateFrame: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  applyBrowserFrameMock: vi.fn(async () => undefined),
  applyFrameMock: vi.fn(),
  resizeCanvasMock: vi.fn(),
  storeGetStateMock: vi.fn(() => storeState),
  syncBackgroundLayerMock: vi.fn(async () => undefined),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: { getState: mocks.storeGetStateMock },
}));

vi.mock('../../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-actions')>()),
  applyEditorBrowserFrameSettings: mocks.applyBrowserFrameMock,
  applyEditorFrameSceneSettings: mocks.applyFrameMock,
  resizeEditorCanvasScene: mocks.resizeCanvasMock,
}));

vi.mock('../../background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../background')>()),
  syncEditorBackgroundLayer: mocks.syncBackgroundLayerMock,
}));

import { applyEditorControllerBrowserFrame } from './browser-frame';
import { createEditorSceneMutationCallbacks } from './callbacks';
import type { EditorBrowserFrameApi, EditorSceneCanvasResizeApi } from './contracts';
import { applyEditorControllerFrame, resizeEditorControllerCanvas } from './resize';
import { createEditorSceneStoreBridge } from './store';

function createSceneController() {
  return {
    canvas: null,
    canvasDocumentSize: { height: 80, width: 120 },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 3),
    ensureReachableObjects: vi.fn(() => true),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    relayoutScene: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } satisfies EditorSceneCanvasResizeApi;
}

function createBrowserFrameController() {
  return {
    canvas: null,
    canvasDocumentSize: { height: 80, width: 120 },
    commitHistory: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    nextLabelIndex: vi.fn(() => 3),
    prepareObject: vi.fn(),
    relayoutScene: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } satisfies EditorBrowserFrameApi;
}

function readFirstCall(mock: ReturnType<typeof vi.fn>) {
  const args = mock.mock.calls[0]?.[0];
  if (!args) {
    throw new Error('Expected mock call');
  }
  return args;
}

describe('public scene action role owners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps store and mutation callbacks separate from scene action dispatch', async () => {
    const controller = createSceneController();
    const store = createEditorSceneStoreBridge();
    const callbacks = createEditorSceneMutationCallbacks(controller);

    store.setBrowserFrame({ ...DEFAULT_BROWSER_FRAME_STATE, title: 'Draft' });
    callbacks.commitHistory();
    callbacks.syncRuntimeState();
    await callbacks.rebuildFrameDecorations();

    expect(storeState.setBrowserFrame).toHaveBeenCalledWith({
      ...DEFAULT_BROWSER_FRAME_STATE,
      title: 'Draft',
    });
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.syncBackgroundLayerMock).toHaveBeenCalledOnce();
  });

  it('builds resize and browser-frame public API args through role-specific owners', async () => {
    const sceneController = createSceneController();
    const browserFrameController = createBrowserFrameController();

    resizeEditorControllerCanvas(sceneController, 100, 50);
    applyEditorControllerFrame(sceneController, {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      paddingTop: 12,
    });
    await applyEditorControllerBrowserFrame(browserFrameController, {
      ...DEFAULT_BROWSER_FRAME_STATE,
      title: 'Next',
    });

    expect(readFirstCall(mocks.resizeCanvasMock).width).toBe(100);
    expect(readFirstCall(mocks.applyFrameMock).frame).toEqual({
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      paddingTop: 12,
    });
    expect(readFirstCall(mocks.applyBrowserFrameMock).browserFrame).toEqual({
      ...DEFAULT_BROWSER_FRAME_STATE,
      title: 'Next',
    });
  });
});
