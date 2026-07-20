// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorViewportZoom: vi.fn(),
  attachEditorControllerEventHandlers: vi.fn(() => ({ disconnect: vi.fn() })),
  clearEditorRasterSelection: vi.fn(),
  createEditorMagnetManager: vi.fn(
    (options: {
      getActiveTool(): string;
      getCanvasDocumentSize(): { height: number; width: number };
      getCropGuide(): unknown;
      getWorkspace(): unknown;
    }) => ({ dispose: vi.fn(), options })
  ),
  getEditorViewportDevicePixelRatioBaseline: vi.fn(() => 2),
  refreshEditorViewportPresentation: vi.fn(),
}));

vi.mock('fabric', () => ({
  Canvas: class MockCanvas {
    backgroundColor = '';
    setDimensions = vi.fn();
    setZoom = vi.fn();
  },
  PencilBrush: class MockPencilBrush {},
}));
vi.mock('../../../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => ({ workspace: { magnetEnabled: true } }) },
}));
vi.mock('../../../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../events')>()),
  attachEditorControllerEventHandlers: mocks.attachEditorControllerEventHandlers,
}));
vi.mock('../../../magnet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../magnet')>()),
  createEditorMagnetManager: mocks.createEditorMagnetManager,
}));
vi.mock('../../../raster-tools/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../raster-tools/session')>()),
  clearEditorRasterSelection: mocks.clearEditorRasterSelection,
}));
vi.mock('../../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoom,
  getEditorViewportDevicePixelRatioBaseline: mocks.getEditorViewportDevicePixelRatioBaseline,
}));
vi.mock('../../../viewport/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../viewport/actions')>()),
  refreshEditorViewportPresentation: mocks.refreshEditorViewportPresentation,
}));

import { mountEditorController } from './mount';
import { disposeEditorController } from './dispose';
import { ensureEditorCanvasReadyHandoff } from '../../../../document/canvas-ready/handoff';
import { createMockController } from '../../bindings/test-fixtures-controller.test-support';

beforeEach(() => {
  vi.clearAllMocks();
});

it('mounts Fabric canvas, viewport observers, magnet manager, and raster selection state', () => {
  const controller = {
    activeTool: 'select',
    canvasDocumentSize: { height: 20, width: 10 },
    cropGuide: null,
    dispose: vi.fn(),
    eventHandlers: {},
    rasterToolSession: {},
    selectionNudgeSession: { step: 1 },
    syncRuntimeState: vi.fn(),
    zoomLevel: 3,
  };
  const viewportElement = document.createElement('div');

  mountEditorController(
    controller as never,
    document.createElement('canvas'),
    viewportElement,
    document.createElement('section')
  );
  const mountedCanvas = (controller as unknown as { canvas: unknown }).canvas;

  expect(controller.dispose).not.toHaveBeenCalled();
  expect(mocks.applyEditorViewportZoom).toHaveBeenCalledWith(
    mountedCanvas,
    controller.canvasDocumentSize,
    1,
    2
  );
  expect(mocks.attachEditorControllerEventHandlers).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: mountedCanvas, viewportElement })
  );
  expect(mocks.createEditorMagnetManager).toHaveBeenCalledOnce();
  const magnetOptions = mocks.createEditorMagnetManager.mock.calls[0]?.[0];
  expect(magnetOptions?.getActiveTool()).toBe('select');
  expect(magnetOptions?.getCanvasDocumentSize()).toEqual({ height: 20, width: 10 });
  expect(magnetOptions?.getCropGuide()).toBeNull();
  expect(magnetOptions?.getWorkspace()).toEqual({ magnetEnabled: true });
  expect(mocks.clearEditorRasterSelection).toHaveBeenCalledWith(controller.rasterToolSession);
  expect(controller.selectionNudgeSession).toBeNull();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('tears down the pending canvas generation when mount setup fails', async () => {
  const expectedError = new Error('viewport setup failed');
  mocks.applyEditorViewportZoom.mockImplementationOnce(() => {
    throw expectedError;
  });
  const controller = createMockController();
  controller.canvas = null;
  const handoff = ensureEditorCanvasReadyHandoff(controller);
  const readyRejection = expect(handoff.wait()).rejects.toThrow(
    'Editor canvas was disposed before it became ready'
  );

  expect(() =>
    mountEditorController(
      controller,
      document.createElement('canvas'),
      document.createElement('div'),
      document.createElement('section')
    )
  ).toThrow(expectedError);

  await readyRejection;
  expect(controller.dispose).toHaveBeenCalledOnce();
});

it('tears down before first mount and starts a fresh remount generation', async () => {
  const controller = createMockController();
  controller.canvas = null;
  const handoff = ensureEditorCanvasReadyHandoff(controller);
  const disposedRejection = expect(handoff.wait()).rejects.toThrow(
    'Editor canvas was disposed before it became ready'
  );

  disposeEditorController(controller);
  await disposedRejection;

  const mountArgs = [
    document.createElement('canvas'),
    document.createElement('div'),
    document.createElement('section'),
  ] as const;
  mountEditorController(controller, ...mountArgs);
  await expect(handoff.wait()).resolves.toBeUndefined();

  mountEditorController(controller, ...mountArgs);
  expect(controller.dispose).toHaveBeenCalledOnce();
  await expect(handoff.wait()).resolves.toBeUndefined();
});
