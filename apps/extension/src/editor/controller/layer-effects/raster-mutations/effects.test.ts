import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRasterEffectsToObject: vi.fn(),
  getRasterEffectObject: vi.fn(),
  isEditorRasterObject: vi.fn(() => true),
  previewEditorRasterEffects: vi.fn(),
  ensureRasterObject: vi.fn(),
  upsertEditorRasterEffect: vi.fn((effects, effect) => [...effects, effect]),
}));

vi.mock('../filters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../filters')>()),
  isEditorRasterObject: mocks.isEditorRasterObject,
  previewEditorRasterEffects: mocks.previewEditorRasterEffects,
}));
vi.mock('../mutation-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mutation-shared')>()),
  applyRasterEffectsToObject: mocks.applyRasterEffectsToObject,
  getRasterEffectObject: mocks.getRasterEffectObject,
  upsertEditorRasterEffect: mocks.upsertEditorRasterEffect,
  ensureRasterObject: mocks.ensureRasterObject,
}));

import {
  applyEditorLayerRasterEffect,
  previewEditorLayerRasterEffect,
  removeEditorLayerRasterEffect,
  resetEditorLayerRasterEffectPreview,
  updateEditorLayerRasterEffect,
} from './effects';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEditorRasterObject.mockReturnValue(true);
});

function createContext() {
  return {
    canvas: { requestRenderAll: vi.fn() },
    effect: { amount: 0.4, enabled: true, id: 'brightness' },
    effectId: 'brightness',
    id: 'layer-1',
    createLayerMutationToken: () => 1,
    isLayerMutationTokenCurrent: () => true,
  };
}

it('applies, updates, removes, previews, and resets raster effects', async () => {
  const context = createContext();
  const object = { sniptaleEffects: [] };
  mocks.ensureRasterObject.mockResolvedValue(object);
  mocks.getRasterEffectObject.mockReturnValue(object);

  await applyEditorLayerRasterEffect(context as never);
  await updateEditorLayerRasterEffect(context as never);
  await removeEditorLayerRasterEffect(context as never);
  await previewEditorLayerRasterEffect(context as never);
  resetEditorLayerRasterEffectPreview(context as never);

  expect(mocks.applyRasterEffectsToObject).toHaveBeenCalledTimes(3);
  expect(mocks.previewEditorRasterEffects).toHaveBeenCalledTimes(2);
  expect(context.canvas.requestRenderAll).toHaveBeenCalledTimes(2);
});

it('skips effect work when targets are missing or not raster objects', async () => {
  mocks.ensureRasterObject.mockResolvedValue(null);
  await applyEditorLayerRasterEffect(createContext() as never);

  mocks.getRasterEffectObject.mockReturnValue(null);
  await updateEditorLayerRasterEffect(createContext() as never);

  mocks.isEditorRasterObject.mockReturnValue(false);
  previewEditorLayerRasterEffect(createContext() as never);

  expect(mocks.applyRasterEffectsToObject).not.toHaveBeenCalled();
});

it('routes background effects through prepared source corrections', async () => {
  const context = {
    ...createContext(),
    rasterCorrections: {
      apply: vi.fn(async (_id: string, _effects: unknown, _preview: boolean) => undefined),
      reset: vi.fn(),
    },
  };
  const accepted = [{ id: 'contrast', amount: 0.2, enabled: true }];
  const object = { sniptaleRole: 'background', sniptaleEffects: accepted };
  mocks.getRasterEffectObject.mockReturnValue(object);
  await applyEditorLayerRasterEffect(context as never);
  await updateEditorLayerRasterEffect(context as never);
  await previewEditorLayerRasterEffect(context as never);
  await removeEditorLayerRasterEffect(context as never);
  resetEditorLayerRasterEffectPreview(context as never);
  expect(context.rasterCorrections.apply).toHaveBeenCalledTimes(4);
  expect(context.rasterCorrections.apply.mock.calls.map((call) => call[2])).toEqual([
    false,
    false,
    true,
    false,
  ]);
  expect(context.rasterCorrections.reset).toHaveBeenCalledOnce();
  expect(mocks.ensureRasterObject).not.toHaveBeenCalled();
  expect(mocks.applyRasterEffectsToObject).not.toHaveBeenCalled();
  expect(mocks.previewEditorRasterEffects).not.toHaveBeenCalled();
  expect(object.sniptaleEffects).toBe(accepted);
});
