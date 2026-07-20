import { beforeEach, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  resizeEditorLayerById: vi.fn(),
}));
const mutationMocks = vi.hoisted(() => ({
  resizeEditorLayerWithRasterize: vi.fn(),
}));

vi.mock('../public-actions/selection/layers/source-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions/selection/layers/source-mutations')>()),
  resizeEditorLayerById: actionMocks.resizeEditorLayerById,
}));

vi.mock('../layer-effects/raster-mutations/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../layer-effects/raster-mutations/resize')>()),
  resizeEditorLayerWithRasterize: mutationMocks.resizeEditorLayerWithRasterize,
}));

import { resizeEditorControllerLayer } from './layer-raster-actions/resize';

function createController() {
  return {
    canvas: {
      getObjects: () => [{ sniptaleId: 'text-layer', sniptaleType: 'text' }],
    },
    commitHistory: vi.fn(),
    ensureObjectReachable: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('resizes non-raster layers through the direct public action seam', () => {
  const controller = createController();

  resizeEditorControllerLayer(controller as never, 'text-layer', 240, 120);

  expect(actionMocks.resizeEditorLayerById).toHaveBeenCalledWith(
    expect.objectContaining({
      height: 120,
      id: 'text-layer',
      width: 240,
    })
  );
  expect(mutationMocks.resizeEditorLayerWithRasterize).not.toHaveBeenCalled();
});
