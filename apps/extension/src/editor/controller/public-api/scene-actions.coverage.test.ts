import { beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import type { EditorBrowserFrameApi, EditorSceneCanvasResizeApi } from './scene-actions/contracts';

type SceneResizeMockArgs = {
  store: { getBrowserFrame: () => BrowserFrameState };
  viewportDevicePixelRatioBaseline?: number;
};

type SceneFrameMockArgs = {
  rebuildFrameDecorations: () => Promise<void>;
  store: { getFrame: () => EditorFrameSettings };
};

type SceneBackgroundSyncArgs = {
  canvas: null;
  canvasSize: { height: number; width: number };
  frame: EditorFrameSettings;
  prepareObject: (object: object) => void;
};

type BrowserFrameMockArgs = {
  commitHistory: () => void;
  ensureBrowserFrameOnTop: () => void;
  ensureReachableObjects?: never;
  nextLabelIndex: (type: 'browser-frame') => number;
  prepareObject: (object: object) => void;
  rebuildFrameDecorations?: never;
  relayoutScene: (
    browserFrame: BrowserFrameState,
    options?: { fitSourceToContent?: boolean }
  ) => void;
  store: {
    getBrowserFrame: () => BrowserFrameState;
    setBrowserFrame: (browserFrame: BrowserFrameState) => void;
    updateFrame: (frame: EditorFrameSettings) => void;
  };
  syncRuntimeState: () => void;
  viewportDevicePixelRatioBaseline?: number;
};

const storeState = {
  browserFrame: createBrowserFrameFixture({
    canvasMode: 'resize',
    contentMode: 'push-down',
    title: 'Stored title',
    url: 'https://stored.example',
  }),
  frame: { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 8 },
  setBrowserFrame: vi.fn(),
  updateFrame: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  applyBrowserFrameMock: vi.fn(async (_args: BrowserFrameMockArgs) => undefined),
  applyFrameMock: vi.fn((_args: SceneFrameMockArgs) => undefined),
  resizeCanvasMock: vi.fn((_args: SceneResizeMockArgs) => undefined),
  resizeSourceSceneMock: vi.fn(),
  storeGetStateMock: vi.fn(() => storeState),
  syncBackgroundLayerMock: vi.fn(async (_args: SceneBackgroundSyncArgs) => undefined),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: mocks.storeGetStateMock },
}));

vi.mock('../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions')>()),
  applyEditorBrowserFrameSettings: mocks.applyBrowserFrameMock,
  applyEditorFrameSceneSettings: mocks.applyFrameMock,
  resizeEditorCanvasScene: mocks.resizeCanvasMock,
  resizeEditorSourceScene: mocks.resizeSourceSceneMock,
}));

vi.mock('../background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../background')>()),
  syncEditorBackgroundLayer: mocks.syncBackgroundLayerMock,
}));

import {
  previewEditorControllerBrowserFrame,
  previewRemoveEditorControllerBrowserFrame,
  removeEditorControllerBrowserFrame,
  applyEditorControllerBrowserFrame,
} from './scene-actions/browser-frame';
import { resizeEditorControllerCanvas, applyEditorControllerFrame } from './scene-actions/resize';

function createBrowserFrameFixture(overrides: Partial<BrowserFrameState> = {}): BrowserFrameState {
  return {
    ...DEFAULT_BROWSER_FRAME_STATE,
    ...overrides,
  };
}

function createController() {
  return {
    canvas: null,
    canvasDocumentSize: { height: 80, width: 120 },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 3),
    ensureBrowserFrameOnTop: vi.fn(),
    ensureReachableObjects: vi.fn(() => true),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    nextLabelIndex: vi.fn(() => 7),
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    relayoutScene: vi.fn(),
    setCanvasDocumentSize: vi.fn(),
    source: null,
    syncRuntimeState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 2,
  } satisfies EditorBrowserFrameApi & EditorSceneCanvasResizeApi;
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function invokeSceneActionBridges(controller: ReturnType<typeof createController>) {
  resizeEditorControllerCanvas(controller, 100, 50);
  applyEditorControllerFrame(controller, { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 12 });
  await applyEditorControllerBrowserFrame(controller, {
    ...createBrowserFrameFixture(),
    canvasMode: 'keep-size',
    contentMode: 'fit-content',
    title: 'Next title',
    url: 'https://next.example',
  });
  await previewEditorControllerBrowserFrame(controller, createBrowserFrameFixture());
  await removeEditorControllerBrowserFrame(controller);
  await previewRemoveEditorControllerBrowserFrame(controller);
}

function readRequiredMockArg<T>(args: [T][], label: string): T {
  const arg = args[0]?.[0];
  if (!arg) {
    throw new Error(`Expected ${label}`);
  }

  return arg;
}

function readSceneActionMockArgs() {
  return {
    applyFrameArgs: readRequiredMockArg(mocks.applyFrameMock.mock.calls, 'frame args'),
    browserArgs: readRequiredMockArg(mocks.applyBrowserFrameMock.mock.calls, 'browser-frame args'),
    resizeCanvasArgs: readRequiredMockArg(mocks.resizeCanvasMock.mock.calls, 'resize-canvas args'),
  };
}

function readRequiredSyncBackgroundLayerArgs() {
  const syncArgs = mocks.syncBackgroundLayerMock.mock.calls[0]?.[0];
  if (syncArgs === undefined) {
    throw new Error('Expected syncEditorBackgroundLayer to be called');
  }

  return syncArgs;
}

async function assertBrowserHeaderBridges(
  controller: ReturnType<typeof createController>,
  browserArgs: BrowserFrameMockArgs
) {
  const browserObject = { id: 'browser-object' };
  browserArgs.store.setBrowserFrame(createBrowserFrameFixture({ title: 'Draft title' }));
  browserArgs.store.updateFrame({ ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 4 });
  browserArgs.relayoutScene(createBrowserFrameFixture({ title: 'Preview title' }), {
    fitSourceToContent: true,
  });
  browserArgs.prepareObject(browserObject);
  browserArgs.ensureBrowserFrameOnTop();
  browserArgs.commitHistory();
  browserArgs.syncRuntimeState();

  expect(storeState.setBrowserFrame).toHaveBeenCalledWith({
    ...DEFAULT_BROWSER_FRAME_STATE,
    title: 'Draft title',
  });
  expect(storeState.updateFrame).toHaveBeenCalledWith({
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    paddingTop: 4,
  });
  expect(controller.relayoutScene).toHaveBeenCalledWith(
    storeState.frame,
    createBrowserFrameFixture({ title: 'Preview title' }),
    { fitSourceToContent: true }
  );
  expect(controller.prepareObject).toHaveBeenCalledWith(browserObject);
  expect(controller.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
  expect(browserArgs.ensureReachableObjects).toBeUndefined();
  expect(browserArgs.rebuildFrameDecorations).toBeUndefined();
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
}

async function assertFrameDecorationBridge(
  controller: ReturnType<typeof createController>,
  applyFrameArgs: SceneFrameMockArgs
) {
  await applyFrameArgs.rebuildFrameDecorations();
  const syncArgs = readRequiredSyncBackgroundLayerArgs();
  const backgroundObject = { id: 'background-object' };

  syncArgs.prepareObject(backgroundObject);
  expect(syncArgs).toEqual(
    expect.objectContaining({
      canvas: null,
      canvasSize: controller.canvasDocumentSize,
      frame: storeState.frame,
      prepareObject: expect.any(Function),
    })
  );
}

it('forwards scene-action wrappers and exposes insert/update browser-header bridges', async () => {
  const controller = createController();
  await invokeSceneActionBridges(controller);

  const { applyFrameArgs, browserArgs, resizeCanvasArgs } = readSceneActionMockArgs();

  expect(resizeCanvasArgs.store.getBrowserFrame()).toEqual(storeState.browserFrame);
  expect(resizeCanvasArgs.viewportDevicePixelRatioBaseline).toBe(1);
  controller.commitHistory.mockClear();
  controller.rebuildFrameDecorations.mockClear();
  controller.syncRuntimeState.mockClear();
  expect(applyFrameArgs.store.getFrame()).toEqual(storeState.frame);
  expect(browserArgs.store.getBrowserFrame()).toEqual(storeState.browserFrame);
  expect(browserArgs.viewportDevicePixelRatioBaseline).toBe(1);
  expect(browserArgs.nextLabelIndex('browser-frame')).toBe(7);
  await assertFrameDecorationBridge(controller, applyFrameArgs);
  await assertBrowserHeaderBridges(controller, browserArgs);

  expect(mocks.applyBrowserFrameMock).toHaveBeenCalledOnce();
});
