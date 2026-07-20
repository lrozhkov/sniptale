import { expect, it, vi } from 'vitest';
import type { EditorRasterEffect } from '../../../../features/editor/document/effects';

const mocks = vi.hoisted(() => ({
  applyEffect: vi.fn(async () => undefined),
  mergeLayers: vi.fn(async () => undefined),
  resizeRaster: vi.fn(),
  resizeVector: vi.fn(),
  transformLayer: vi.fn(async () => undefined),
}));

vi.mock('../../layer-effects/merge', () => ({
  mergeEditorSelectedLayers: mocks.mergeLayers,
}));
vi.mock('../../layer-effects/raster-mutations/effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../layer-effects/raster-mutations/effects')>()),
  applyEditorLayerRasterEffect: mocks.applyEffect,
}));
vi.mock('../../layer-effects/raster-mutations/resize', () => ({
  resizeEditorLayerWithRasterize: mocks.resizeRaster,
}));
vi.mock('../../layer-effects/raster-mutations/transform', () => ({
  applyEditorLayerTransformation: mocks.transformLayer,
}));
vi.mock('../../layer-effects/rasterize/layer-type', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../layer-effects/rasterize/layer-type')>()),
  isEditorRasterLayerType: (type: string) => type === 'image',
}));
vi.mock('../../public-actions/selection/layers/source-mutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../public-actions/selection/layers/source-mutations')
  >()),
  resizeEditorLayerById: mocks.resizeVector,
}));

import { applyEditorControllerLayerEffect } from './effects';
import { mergeEditorControllerSelectedLayers } from './merge';
import { resizeEditorControllerLayer } from './resize';
import { applyEditorControllerLayerTransformation } from './transform';

function createController(type = 'image') {
  return {
    canvas: { getObjects: () => [{ sniptaleId: 'layer-1', sniptaleType: type }] },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 1),
    ensureObjectReachable: vi.fn(),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

it('forwards raster mutation actions through controller-owned bindings', async () => {
  const controller = createController();
  const effect: EditorRasterEffect = { amount: 0.4, enabled: true, id: 'brightness' };

  await mergeEditorControllerSelectedLayers(controller as never);
  await applyEditorControllerLayerEffect(controller as never, 'layer-1', effect);
  await applyEditorControllerLayerTransformation(controller as never, 'layer-1', 'rotate-right');

  expect(mocks.mergeLayers).toHaveBeenCalledWith(
    expect.objectContaining({ source: controller.source })
  );
  expect(mocks.applyEffect).toHaveBeenCalledWith(
    expect.objectContaining({ effect, id: 'layer-1' })
  );
  expect(mocks.transformLayer).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'layer-1', transformationId: 'rotate-right' })
  );
});

it('routes vector resize away from raster mutation while keeping raster layers async', () => {
  resizeEditorControllerLayer(createController('rectangle') as never, 'layer-1', 100, 50);
  resizeEditorControllerLayer(createController('image') as never, 'layer-1', 120, 60);

  expect(mocks.resizeVector).toHaveBeenCalledWith(
    expect.objectContaining({ height: 50, width: 100 })
  );
  expect(mocks.resizeRaster).toHaveBeenCalledWith(
    expect.objectContaining({ height: 60, width: 120 })
  );
});
