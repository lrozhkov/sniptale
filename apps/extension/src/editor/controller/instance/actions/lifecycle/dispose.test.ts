import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearEditorRasterSelection: vi.fn(),
  clearEditorRasterTransientState: vi.fn(),
  detachEditorControllerEventHandlers: vi.fn(),
}));

vi.mock('../../../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../events')>()),
  detachEditorControllerEventHandlers: mocks.detachEditorControllerEventHandlers,
}));
vi.mock('../../../raster-tools/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../raster-tools/session')>()),
  clearEditorRasterSelection: mocks.clearEditorRasterSelection,
  clearEditorRasterTransientState: mocks.clearEditorRasterTransientState,
}));

import { disposeEditorController } from './dispose';

it('disposes controller canvas bindings and transient raster state', () => {
  const canvas = { dispose: vi.fn() };
  const magnetManager = { dispose: vi.fn() };
  const controller = {
    canvas,
    cropGuide: { id: 'crop' },
    drawSession: { id: 'draw' },
    eventHandlers: {},
    isSpacePressed: true,
    magnetManager,
    panSession: { id: 'pan' },
    rasterToolSession: {},
    selectionNudgeSession: { step: 1 },
    stageElement: {},
    viewportElement: {},
    viewportResizeObserver: { disconnect: vi.fn() },
    viewportSyncFrame: 0,
  };

  disposeEditorController(controller as never);

  expect(mocks.detachEditorControllerEventHandlers).toHaveBeenCalledOnce();
  expect(magnetManager.dispose).toHaveBeenCalledOnce();
  expect(canvas.dispose).toHaveBeenCalledOnce();
  expect(controller.canvas).toBeNull();
  expect(controller.cropGuide).toBeNull();
  expect(controller.selectionNudgeSession).toBeNull();
  expect(mocks.clearEditorRasterTransientState).toHaveBeenCalledWith(controller.rasterToolSession);
  expect(mocks.clearEditorRasterSelection).toHaveBeenCalledWith(controller.rasterToolSession);
});
