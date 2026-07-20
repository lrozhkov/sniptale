import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorControllerLayerEffect: vi.fn(async () => undefined),
  applyEditorControllerLayerTransformation: vi.fn(async () => undefined),
  mergeEditorControllerSelectedLayers: vi.fn(async () => undefined),
  previewEditorControllerLayerEffect: vi.fn(),
  removeEditorControllerLayerEffect: vi.fn(),
  resetEditorControllerLayerEffectPreview: vi.fn(),
  resizeEditorControllerLayer: vi.fn(),
  selectEditorControllerLayer: vi.fn(),
  renameEditorControllerLayer: vi.fn(),
  reorderEditorControllerLayer: vi.fn(),
  toggleEditorControllerLayerLock: vi.fn(),
  toggleEditorControllerLayerVisibility: vi.fn(),
  updateEditorControllerLayerEffect: vi.fn(async () => undefined),
}));

vi.mock('../../public-api/layer-selection-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-selection-actions')>()),
  selectEditorControllerLayer: mocks.selectEditorControllerLayer,
  reorderEditorControllerLayer: mocks.reorderEditorControllerLayer,
}));

vi.mock('../../public-api/layer-metadata-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-metadata-actions')>()),
  renameEditorControllerLayer: mocks.renameEditorControllerLayer,
  toggleEditorControllerLayerLock: mocks.toggleEditorControllerLayerLock,
  toggleEditorControllerLayerVisibility: mocks.toggleEditorControllerLayerVisibility,
}));

vi.mock('../../public-api/layer-raster-actions/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/resize')>()),
  resizeEditorControllerLayer: mocks.resizeEditorControllerLayer,
}));

vi.mock('../../public-api/layer-raster-actions/merge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/merge')>()),
  mergeEditorControllerSelectedLayers: mocks.mergeEditorControllerSelectedLayers,
}));

vi.mock('../../public-api/layer-raster-actions/effects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/effects')>()),
  applyEditorControllerLayerEffect: mocks.applyEditorControllerLayerEffect,
  previewEditorControllerLayerEffect: mocks.previewEditorControllerLayerEffect,
  removeEditorControllerLayerEffect: mocks.removeEditorControllerLayerEffect,
  resetEditorControllerLayerEffectPreview: mocks.resetEditorControllerLayerEffectPreview,
  updateEditorControllerLayerEffect: mocks.updateEditorControllerLayerEffect,
}));

vi.mock('../../public-api/layer-raster-actions/transform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../public-api/layer-raster-actions/transform')>()),
  applyEditorControllerLayerTransformation: mocks.applyEditorControllerLayerTransformation,
}));

import {
  applyLayerEffectForController,
  applyLayerTransformationForController,
  mergeSelectedLayersForController,
  previewLayerEffectForController,
  removeLayerEffectForController,
  renameLayerForController,
  reorderLayerForController,
  resetLayerEffectPreviewForController,
  resizeLayerForController,
  selectLayerForController,
  toggleLayerLockForController,
  toggleLayerVisibilityForController,
  updateLayerEffectForController,
} from './layer-instance-actions';

function createController() {
  return {
    getPublicApiAdapter: vi.fn(() => ({ id: 'adapter' })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes layer list commands through the public api adapter', () => {
  const controller = createController();

  reorderLayerForController(controller as never, 'dragged', 'target');
  selectLayerForController(controller as never, 'layer-1', { toggle: true });
  renameLayerForController(controller as never, 'layer-1', 'Renamed');
  toggleLayerVisibilityForController(controller as never, 'layer-1');
  toggleLayerLockForController(controller as never, 'layer-1');

  expect(mocks.reorderEditorControllerLayer).toHaveBeenCalledWith(
    { id: 'adapter' },
    'dragged',
    'target'
  );
  expect(mocks.selectEditorControllerLayer).toHaveBeenCalledWith({ id: 'adapter' }, 'layer-1', {
    toggle: true,
  });
  expect(mocks.renameEditorControllerLayer).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    'Renamed'
  );
  expect(mocks.toggleEditorControllerLayerVisibility).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1'
  );
  expect(mocks.toggleEditorControllerLayerLock).toHaveBeenCalledWith({ id: 'adapter' }, 'layer-1');
});

it('routes layer raster commands through the public api adapter', async () => {
  const controller = createController();

  resizeLayerForController(controller as never, 'layer-1', 120, 80);
  await mergeSelectedLayersForController(controller as never);

  expect(mocks.resizeEditorControllerLayer).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    120,
    80
  );
  expect(mocks.mergeEditorControllerSelectedLayers).toHaveBeenCalledWith({ id: 'adapter' });
});

it('routes layer effect commands through the public api adapter', async () => {
  const controller = createController();
  const effect = { amount: 0.4, enabled: true, id: 'brightness' } as const;

  await applyLayerEffectForController(controller as never, 'layer-1', effect);
  await updateLayerEffectForController(controller as never, 'layer-1', effect);
  previewLayerEffectForController(controller as never, 'layer-1', effect);
  resetLayerEffectPreviewForController(controller as never, 'layer-1');
  removeLayerEffectForController(controller as never, 'layer-1', 'brightness');

  expect(mocks.applyEditorControllerLayerEffect).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    effect
  );
  expect(mocks.updateEditorControllerLayerEffect).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    effect
  );
  expect(mocks.previewEditorControllerLayerEffect).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    effect
  );
  expect(mocks.resetEditorControllerLayerEffectPreview).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1'
  );
  expect(mocks.removeEditorControllerLayerEffect).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    'brightness'
  );
});

it('routes layer transform commands through the public api adapter', async () => {
  const controller = createController();

  await applyLayerTransformationForController(controller as never, 'layer-1', 'rotate-right');

  expect(mocks.applyEditorControllerLayerTransformation).toHaveBeenCalledWith(
    { id: 'adapter' },
    'layer-1',
    'rotate-right'
  );
});
