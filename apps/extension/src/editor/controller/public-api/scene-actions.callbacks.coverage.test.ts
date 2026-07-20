import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  commitHistory: () => void;
  ensureReachableObjects: () => boolean;
  rebuildFrameDecorations: () => Promise<void>;
  relayoutScene: (
    frame: EditorFrameSettings,
    browserFrame: BrowserFrameState,
    options?: { fitSourceToContent?: boolean; preserveCanvasSize?: boolean }
  ) => void;
  setCanvasDocumentSize: (size: { height: number; width: number }) => void;
  syncRuntimeState: () => void;
};

type SceneFrameMockArgs = Omit<SceneResizeMockArgs, 'setCanvasDocumentSize'>;

type BrowserFrameMockArgs = {
  commitHistory: () => void;
  ensureBrowserFrameOnTop: () => void;
  ensureReachableObjects?: never;
  logBrowserFrame?: never;
  nextLabelIndex: (type: 'browser-frame') => number;
  prepareFrameDecorations?: never;
  prepareObject: (object: object) => void;
  rebuildFrameDecorations?: never;
  relayoutScene: (
    browserFrame: BrowserFrameState,
    options?: { preserveCanvasSize?: boolean }
  ) => void;
  store: {
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
  frame: {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#ffffff',
    paddingTop: 8,
  },
  setBrowserFrame: vi.fn(),
  updateFrame: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  applyBrowserFrameMock: vi.fn(async (_args: BrowserFrameMockArgs) => undefined),
  applyFrameMock: vi.fn((_args: SceneFrameMockArgs) => undefined),
  resizeCanvasMock: vi.fn((_args: SceneResizeMockArgs) => undefined),
  resizeSourceSceneMock: vi.fn(),
  storeGetStateMock: vi.fn(() => storeState),
  syncBackgroundLayerMock: vi.fn(async () => undefined),
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

import { resizeEditorControllerCanvas, applyEditorControllerFrame } from './scene-actions/resize';
import { applyEditorControllerBrowserFrame } from './scene-actions/browser-frame';

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
    ensureReachableObjects: vi.fn(),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    nextLabelIndex: vi.fn(() => 11),
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

function expectMockArgs<T>(calls: [T][], index: number, label: string): T {
  const args = calls[index]?.[0];
  if (!args) {
    throw new Error(`Expected ${label}`);
  }

  return args;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function exerciseBrowserHeaderCallbackBridge(browserArgs: BrowserFrameMockArgs) {
  browserArgs.store.setBrowserFrame(createBrowserFrameFixture({ title: 'Draft title' }));
  browserArgs.store.updateFrame({ ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 4 });
  browserArgs.relayoutScene(createBrowserFrameFixture({ title: 'Preview title' }), {
    preserveCanvasSize: true,
  });
  browserArgs.prepareObject({ id: 'header-object' });
  browserArgs.ensureBrowserFrameOnTop();
  browserArgs.commitHistory();
  browserArgs.syncRuntimeState();
}

function registerCanvasResizeCallbacksTest() {
  it('forwards canvas resize callbacks', async () => {
    const controller = createController();

    resizeEditorControllerCanvas(controller, 100, 50);

    const resizeCanvasArgs = expectMockArgs(
      mocks.resizeCanvasMock.mock.calls,
      0,
      'resize-canvas args'
    );
    resizeCanvasArgs.setCanvasDocumentSize({ height: 40, width: 60 });
    resizeCanvasArgs.relayoutScene(
      { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 2 },
      storeState.browserFrame,
      {
        fitSourceToContent: true,
      }
    );
    resizeCanvasArgs.ensureReachableObjects();
    await resizeCanvasArgs.rebuildFrameDecorations();
    resizeCanvasArgs.commitHistory();
    resizeCanvasArgs.syncRuntimeState();

    expect(controller.setCanvasDocumentSize).toHaveBeenCalledWith({ height: 40, width: 60 });
    expect(controller.relayoutScene).toHaveBeenCalledWith(
      { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 2 },
      storeState.browserFrame,
      { fitSourceToContent: true }
    );
    expect(mocks.syncBackgroundLayerMock).toHaveBeenCalledOnce();
    expect(controller.rebuildFrameDecorations).toHaveBeenCalledOnce();
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerImageSceneAndFrameCallbacksTest() {
  it('forwards frame callbacks', async () => {
    const controller = createController();

    applyEditorControllerFrame(controller, { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 12 });

    const frameArgs = expectMockArgs(mocks.applyFrameMock.mock.calls, 0, 'frame args');

    frameArgs.relayoutScene(
      { ...DEFAULT_EDITOR_FRAME_SETTINGS, paddingTop: 5 },
      storeState.browserFrame,
      {
        preserveCanvasSize: true,
      }
    );

    expect(controller.relayoutScene).toHaveBeenCalledOnce();
  });
}

function registerBrowserHeaderCallbacksTest() {
  it('forwards browser-header insert/update callbacks without legacy decoration helpers', async () => {
    const controller = createController();

    await applyEditorControllerBrowserFrame(controller, {
      ...createBrowserFrameFixture(),
      canvasMode: 'keep-size',
      contentMode: 'fit-content',
      title: 'Next title',
      url: 'https://next.example',
    });

    const browserArgs = expectMockArgs(
      mocks.applyBrowserFrameMock.mock.calls,
      0,
      'browser-frame args'
    );

    expect(browserArgs.viewportDevicePixelRatioBaseline).toBe(1);
    exerciseBrowserHeaderCallbackBridge(browserArgs);

    expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'header-object' });
    expect(browserArgs.nextLabelIndex('browser-frame')).toBe(11);
    expect(browserArgs.ensureReachableObjects).toBeUndefined();
    expect(browserArgs.rebuildFrameDecorations).toBeUndefined();
    expect(browserArgs.prepareFrameDecorations).toBeUndefined();
    expect(browserArgs.logBrowserFrame).toBeUndefined();
    expect(controller.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

describe('public-api scene callback bridges', () => {
  registerCanvasResizeCallbacksTest();
  registerImageSceneAndFrameCallbacksTest();
  registerBrowserHeaderCallbacksTest();
});
