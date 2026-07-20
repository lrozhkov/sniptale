import { expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  resizeEditorLayerByIdMock: vi.fn(),
}));
const mutationMocks = vi.hoisted(() => ({
  resizeEditorLayerWithRasterizeMock: vi.fn(),
}));

vi.mock('../public-actions/selection/layers/source-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions/selection/layers/source-mutations')>()),
  resizeEditorLayerById: actionMocks.resizeEditorLayerByIdMock,
}));
vi.mock('../layer-effects/raster-mutations/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layer-effects/raster-mutations/resize')>()),
  resizeEditorLayerWithRasterize: mutationMocks.resizeEditorLayerWithRasterizeMock,
}));

import { resizeEditorControllerLayer } from './layer-raster-actions/resize';

function createController() {
  return {
    canvas: {
      getObjects: vi.fn(() => [{ sniptaleId: 'layer-1', sniptaleType: 'text' }]),
    },
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

it('resizes vector layers through the public action seam without rasterizing', () => {
  const controller = createController();

  resizeEditorControllerLayer(controller as never, 'layer-1', 320, 180);

  expect(actionMocks.resizeEditorLayerByIdMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canvas: controller.canvas,
      height: 180,
      id: 'layer-1',
      width: 320,
    })
  );
  expect(mutationMocks.resizeEditorLayerWithRasterizeMock).not.toHaveBeenCalled();

  const handlers = actionMocks.resizeEditorLayerByIdMock.mock.calls[0]?.[0];
  handlers.setSource({ id: 'resized-source' });
  handlers.ensureObjectReachable({ sniptaleId: 'layer-1' });
  handlers.commitHistory();
  handlers.syncRuntimeState();

  expect(controller.setSource).toHaveBeenCalledWith({ id: 'resized-source' });
  expect(controller.ensureObjectReachable).toHaveBeenCalledWith({ sniptaleId: 'layer-1' });
  expect(controller.commitHistory).toHaveBeenCalled();
  expect(controller.syncRuntimeState).toHaveBeenCalled();
});
