import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyDocumentMock: vi.fn(),
  createHistoryMock: vi.fn((document) => ({ seed: document })),
  ensureBrowserFrameOnTopMock: vi.fn(),
  logBrowserFrameMock: vi.fn(),
  rebuildFrameDecorationsMock: vi.fn(async () => undefined),
  relayoutSceneMock: vi.fn(),
  syncBackgroundLayerMock: vi.fn(async () => undefined),
}));

vi.mock('../../history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../history')>()),
  createEditorSnapshotHistory: mocks.createHistoryMock,
}));

vi.mock('../../browser-frame/document', () => ({
  ensureEditorBrowserFrameOnTop: mocks.ensureBrowserFrameOnTopMock,
  logEditorBrowserFrame: mocks.logBrowserFrameMock,
  rebuildEditorControllerFrameDecorations: mocks.rebuildFrameDecorationsMock,
  relayoutEditorControllerScene: mocks.relayoutSceneMock,
}));

vi.mock('../../document/lifecycle/apply/run', () => ({
  applyEditorControllerDocument: mocks.applyDocumentMock,
}));

vi.mock('../../background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../background')>()),
  syncEditorBackgroundLayer: mocks.syncBackgroundLayerMock,
}));

import {
  applyDocumentForController,
  ensureBrowserFrameOnTopForController,
  logBrowserFrameForController,
  rebuildFrameDecorationsForController,
  relayoutSceneForController,
} from './document';

function createController() {
  return {
    activeTool: 'select',
    applyToolMode: vi.fn(),
    browserFrameRenderToken: 1,
    canvas: { id: 'canvas' },
    canvasDocumentSize: { height: 20, width: 40 },
    cropGuide: null,
    cropSelection: null,
    ensureBrowserFrameOnTop: vi.fn(),
    history: null,
    layerMutationToken: 0,
    originalDocument: null,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
    toolModeEnabled: true,
    zoomLevel: 2,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  (mocks.syncBackgroundLayerMock as any).mockImplementation(async (args: any) => {
    args.prepareObject({ id: 'background' });
    const token = args.createMutationToken();
    args.isMutationTokenCurrent(token);
  });
  (mocks.rebuildFrameDecorationsMock as any).mockImplementation(async (args: any) => {
    args.setBrowserFrameRenderToken(7);
    args.isBrowserFrameRenderTokenCurrent(7);
    args.ensureBrowserFrameOnTop();
  });
});

function mockApplyDocumentStateTransition() {
  mocks.applyDocumentMock.mockImplementationOnce(async (args) => {
    args.prepareObject({ id: 'prepared-object' });
    args.setCanvasDocumentSize({ height: 60, width: 80 });
    args.setSource({ id: 'applied-source' });
    args.setCropState(null, null);
    args.setActiveTool('draw');
    await args.syncBackgroundLayer({ backgroundMode: 'color' }, { height: 70, width: 90 });
    args.applyToolMode();
    args.setOriginalDocument({ id: 'original' });
    args.setHistory({ id: 'history' });
    await args.rebuildFrameDecorations();
    args.syncRuntimeState();
  });
}

function expectControllerDocumentState(controller: ReturnType<typeof createController>) {
  expect(controller.canvasDocumentSize).toEqual({ height: 60, width: 80 });
  expect(controller.source).toEqual({ id: 'applied-source' });
  expect(controller.activeTool).toBe('draw');
  expect(controller.toolModeEnabled).toBe(true);
  expect(controller.originalDocument).toEqual({ id: 'original' });
  expect(controller.history).toEqual({ seed: { id: 'history' } });
  expect(controller.browserFrameRenderToken).toBe(7);
}

it('relayouts scenes only when lifecycle returns a next scene', () => {
  const controller = createController();
  relayoutSceneForController(controller, { padding: 2 } as never, { enabled: true } as never);

  mocks.relayoutSceneMock.mockReturnValueOnce({
    canvasSize: { height: 90, width: 120 },
    source: { id: 'next-source' },
  });
  relayoutSceneForController(controller, { padding: 4 } as never, { enabled: false } as never);

  expect(controller.canvasDocumentSize).toEqual({ height: 90, width: 120 });
  expect(controller.source).toEqual({ id: 'next-source' });
});

it('applies documents and updates controller-owned state through wrapper closures', async () => {
  const controller = createController();
  controller.toolModeEnabled = false;
  mockApplyDocumentStateTransition();

  await applyDocumentForController(controller, { id: 'document' } as never, {
    resetHistory: true,
    updateOriginal: true,
  });
  await rebuildFrameDecorationsForController(controller);
  logBrowserFrameForController('ready', { objects: 2 });
  ensureBrowserFrameOnTopForController(controller);

  expectControllerDocumentState(controller);
  expect(controller.rebuildFrameDecorations).toHaveBeenCalledOnce();
  expect(mocks.rebuildFrameDecorationsMock).toHaveBeenCalledOnce();
  expect(mocks.rebuildFrameDecorationsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrameRenderToken: 1,
      source: { id: 'applied-source' },
    })
  );
  expect(controller.applyToolMode).toHaveBeenCalledOnce();
  expect(mocks.syncBackgroundLayerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canvas: controller.canvas,
      canvasSize: { height: 70, width: 90 },
      frame: { backgroundMode: 'color' },
    })
  );
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  expect(mocks.logBrowserFrameMock).toHaveBeenCalledWith('ready', { objects: 2 });
  expect(mocks.ensureBrowserFrameOnTopMock).toHaveBeenCalledOnce();
});
