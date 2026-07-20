import type { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorControllerInstance, EditorControllerPublicApiAdapter } from '../types';

const mocks = vi.hoisted(() => ({
  applyEditorControllerBrowserFrameMock: vi.fn(),
  applyEditorControllerFrameMock: vi.fn(),
  navigateEditorViewportToMock: vi.fn(),
  previewEditorControllerBrowserFrameMock: vi.fn(),
  previewRemoveEditorControllerBrowserFrameMock: vi.fn(),
  removeEditorControllerBrowserFrameMock: vi.fn(),
  resizeEditorControllerCanvasMock: vi.fn(),
  resizeEditorControllerImageSceneMock: vi.fn(),
  setEditorZoomAtViewportPointMock: vi.fn(),
  setEditorZoomCenteredMock: vi.fn(),
  setEditorZoomMock: vi.fn(),
  zoomEditorToFitMock: vi.fn(),
}));

vi.mock('../../public-api/image-scene-resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/image-scene-resize')>()),
  resizeEditorControllerImageScene: mocks.resizeEditorControllerImageSceneMock,
}));

vi.mock('../../public-api/scene-actions/browser-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/scene-actions/browser-frame')>()),
  applyEditorControllerBrowserFrame: mocks.applyEditorControllerBrowserFrameMock,
  previewEditorControllerBrowserFrame: mocks.previewEditorControllerBrowserFrameMock,
  previewRemoveEditorControllerBrowserFrame: mocks.previewRemoveEditorControllerBrowserFrameMock,
  removeEditorControllerBrowserFrame: mocks.removeEditorControllerBrowserFrameMock,
}));

vi.mock('../../public-api/scene-actions/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/scene-actions/resize')>()),
  applyEditorControllerFrame: mocks.applyEditorControllerFrameMock,
  resizeEditorControllerCanvas: mocks.resizeEditorControllerCanvasMock,
}));

vi.mock('../../viewport/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport/actions')>()),
  navigateEditorViewportTo: mocks.navigateEditorViewportToMock,
  setEditorZoomAtViewportPoint: mocks.setEditorZoomAtViewportPointMock,
  setEditorZoomCentered: mocks.setEditorZoomCenteredMock,
  setEditorZoom: mocks.setEditorZoomMock,
  zoomEditorToFit: mocks.zoomEditorToFitMock,
}));

import {
  applyBrowserFrameForController,
  applyFrameSettingsForController,
  navigateViewportForController,
  previewBrowserFrameForController,
  previewRemoveBrowserFrameForController,
  removeBrowserFrameForController,
  resetZoomForController,
  resizeCanvasForController,
  resizeImageForController,
  setZoomAtViewportPointForController,
  setZoomCenteredForController,
  setZoomForController,
  zoomInForController,
  zoomOutForController,
  zoomToFitForController,
} from './scene';

type SceneControllerStub = Pick<
  EditorControllerInstance,
  | 'canvas'
  | 'canvasDocumentSize'
  | 'getPublicApiAdapter'
  | 'stageElement'
  | 'syncRuntimeState'
  | 'syncViewportState'
  | 'viewportDevicePixelRatioBaseline'
  | 'viewportElement'
  | 'zoomLevel'
>;

function createController(): SceneControllerStub {
  return {
    canvas: {} as Canvas,
    canvasDocumentSize: { width: 800, height: 600 },
    getPublicApiAdapter: vi.fn(
      () => ({ id: 'adapter' }) as unknown as EditorControllerPublicApiAdapter
    ),
    stageElement: {} as HTMLElement,
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    viewportElement: {} as HTMLElement,
    zoomLevel: 1,
  };
}

function invokeSceneSyncCallbacks() {
  const zoomToFitOptions = mocks.zoomEditorToFitMock.mock.calls[0]?.[0];
  const setZoomOptions = mocks.setEditorZoomMock.mock.calls[0]?.[0];
  const navigateViewportOptions = mocks.navigateEditorViewportToMock.mock.calls[0]?.[0];

  expect(zoomToFitOptions).toMatchObject({ canvasDocumentSize: { width: 800, height: 600 } });
  expect(setZoomOptions).toMatchObject({ zoomLevel: 0.8 });
  zoomToFitOptions?.syncViewportState();
  zoomToFitOptions?.syncRuntimeState();
  setZoomOptions?.syncViewportState();
  setZoomOptions?.syncRuntimeState();
  navigateViewportOptions?.syncViewportState();
}

function expectSceneNavigationRouted(controller: SceneControllerStub) {
  expect(controller.zoomLevel).toBe(1.75);
  expect(mocks.zoomEditorToFitMock).toHaveBeenCalledOnce();
  expect(mocks.setEditorZoomMock).toHaveBeenCalledWith(expect.any(Object), 1.5);
  expect(mocks.setEditorZoomCenteredMock).toHaveBeenCalledWith(expect.any(Object), 1.25);
  expect(mocks.setEditorZoomAtViewportPointMock).toHaveBeenCalledWith(expect.any(Object), 1.75, {
    clientX: 10,
    clientY: 20,
  });
  expect(mocks.navigateEditorViewportToMock).toHaveBeenCalledWith(
    expect.objectContaining({
      devicePixelRatioBaseline: 1,
      relativeX: 0.25,
      relativeY: 0.75,
    })
  );
  expect(controller.syncViewportState).toHaveBeenCalledTimes(3);
  expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);
}

async function runSceneMutationFlow(
  controller: SceneControllerStub,
  frame: Record<string, unknown>,
  browserFrame: Record<string, unknown>
) {
  resizeCanvasForController(controller as EditorControllerInstance, 1200, 800);
  resizeImageForController(controller as EditorControllerInstance, 900, 700);
  applyFrameSettingsForController(controller as EditorControllerInstance, frame as never);
  await applyBrowserFrameForController(
    controller as EditorControllerInstance,
    browserFrame as never
  );
  await previewBrowserFrameForController(
    controller as EditorControllerInstance,
    browserFrame as never
  );
  await removeBrowserFrameForController(controller as EditorControllerInstance);
  await previewRemoveBrowserFrameForController(controller as EditorControllerInstance);
}

function expectSceneMutationRouted(
  frame: Record<string, unknown>,
  browserFrame: Record<string, unknown>
) {
  expect(mocks.resizeEditorControllerCanvasMock).toHaveBeenCalledWith({ id: 'adapter' }, 1200, 800);
  expect(mocks.resizeEditorControllerImageSceneMock).toHaveBeenCalledWith(
    { id: 'adapter' },
    900,
    700
  );
  expect(mocks.applyEditorControllerFrameMock).toHaveBeenCalledWith({ id: 'adapter' }, frame);
  expect(mocks.applyEditorControllerBrowserFrameMock).toHaveBeenCalledWith(
    { id: 'adapter' },
    browserFrame
  );
  expect(mocks.previewEditorControllerBrowserFrameMock).toHaveBeenCalledWith(
    { id: 'adapter' },
    browserFrame
  );
  expect(mocks.removeEditorControllerBrowserFrameMock).toHaveBeenCalledWith({ id: 'adapter' });
  expect(mocks.previewRemoveEditorControllerBrowserFrameMock).toHaveBeenCalledWith({
    id: 'adapter',
  });
}

function registerSceneNavigationTest() {
  it('routes zoom and viewport navigation through the scene helpers', async () => {
    const controller = createController();

    zoomToFitForController(controller as EditorControllerInstance);
    setZoomForController(controller as EditorControllerInstance, 1.5);
    setZoomCenteredForController(controller as EditorControllerInstance, 1.25);
    setZoomAtViewportPointForController(controller as EditorControllerInstance, 1.75, {
      clientX: 10,
      clientY: 20,
    });
    navigateViewportForController(controller as EditorControllerInstance, 0.25, 0.75);
    invokeSceneSyncCallbacks();
    expectSceneNavigationRouted(controller);
  });
}

function registerZoomConvenienceTest() {
  it('routes zoom convenience actions through the explicit zoom helper', () => {
    const controller = createController();
    controller.zoomLevel = 2;
    mocks.setEditorZoomMock.mockImplementation((_context, value: number) => value);

    zoomInForController(controller as EditorControllerInstance);
    zoomOutForController(controller as EditorControllerInstance);
    resetZoomForController(controller as EditorControllerInstance);

    expect(mocks.setEditorZoomMock).toHaveBeenCalledWith(expect.any(Object), 2.3);
    expect(mocks.setEditorZoomMock).toHaveBeenCalledWith(expect.any(Object), 2);
    expect(mocks.setEditorZoomMock).toHaveBeenCalledWith(expect.any(Object), 1);
  });
}

function registerSceneMutationTest() {
  it('routes scene mutations through the public api adapter', async () => {
    const controller = createController();
    const frame = { paddingTop: 10 };
    const browserFrame = { enabled: true };

    await runSceneMutationFlow(controller, frame as never, browserFrame);
    expectSceneMutationRouted(frame, browserFrame);
  });
}

describe('editor-controller-instance-scene-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setEditorZoomMock.mockReturnValue(1.5);
    mocks.setEditorZoomAtViewportPointMock.mockReturnValue(1.75);
    mocks.setEditorZoomCenteredMock.mockReturnValue(1.25);
    mocks.zoomEditorToFitMock.mockReturnValue(0.8);
    mocks.applyEditorControllerBrowserFrameMock.mockResolvedValue(undefined);
    mocks.previewEditorControllerBrowserFrameMock.mockResolvedValue(undefined);
    mocks.previewRemoveEditorControllerBrowserFrameMock.mockResolvedValue(undefined);
    mocks.removeEditorControllerBrowserFrameMock.mockResolvedValue(undefined);
  });

  registerSceneNavigationTest();
  registerZoomConvenienceTest();
  registerSceneMutationTest();
});
