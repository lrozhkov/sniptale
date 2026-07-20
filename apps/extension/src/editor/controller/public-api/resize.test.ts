import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function createControllerWithLayer(sniptaleType: string) {
  return {
    canvas: {
      getObjects: vi.fn(() => [{ sniptaleId: 'layer-1', sniptaleType }]),
    },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 2),
    ensureObjectReachable: vi.fn(),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

describe('editor-controller public api resize routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes live blur annotation resize through the annotation layer owner', () => {
    const controller = createControllerWithLayer('blur');

    resizeEditorControllerLayer(controller as never, 'layer-1', 320, 180);

    expect(actionMocks.resizeEditorLayerById).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 180,
        id: 'layer-1',
        width: 320,
      })
    );
    expect(mutationMocks.resizeEditorLayerWithRasterize).not.toHaveBeenCalled();
  });

  it('keeps raster image resize on the raster mutation owner', () => {
    const controller = createControllerWithLayer('image');

    resizeEditorControllerLayer(controller as never, 'layer-1', 320, 180);

    expect(mutationMocks.resizeEditorLayerWithRasterize).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 180,
        id: 'layer-1',
        width: 320,
      })
    );
    expect(actionMocks.resizeEditorLayerById).not.toHaveBeenCalled();
  });
});
