import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRasterEffectsToObject: vi.fn(),
  getEditableObject: vi.fn(),
  isEditorRasterObject: vi.fn(() => true),
  previewEditorRasterEffects: vi.fn(),
  resolveRasterizedMutationTarget: vi.fn(),
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
  getEditableObject: mocks.getEditableObject,
  upsertEditorRasterEffect: mocks.upsertEditorRasterEffect,
}));
vi.mock('./target', () => ({
  resolveRasterizedMutationTarget: mocks.resolveRasterizedMutationTarget,
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
  };
}

it('applies, updates, removes, previews, and resets raster effects', async () => {
  const context = createContext();
  const object = { sniptaleEffects: [] };
  mocks.resolveRasterizedMutationTarget.mockResolvedValue({
    canvas: context.canvas,
    target: object,
  });
  mocks.getEditableObject.mockReturnValue(object);

  await applyEditorLayerRasterEffect(context as never);
  await updateEditorLayerRasterEffect(context as never);
  removeEditorLayerRasterEffect(context as never);
  previewEditorLayerRasterEffect(context as never);
  resetEditorLayerRasterEffectPreview(context as never);

  expect(mocks.applyRasterEffectsToObject).toHaveBeenCalledTimes(3);
  expect(mocks.previewEditorRasterEffects).toHaveBeenCalledTimes(2);
  expect(context.canvas.requestRenderAll).toHaveBeenCalledTimes(2);
});

it('skips effect work when targets are missing or not raster objects', async () => {
  mocks.resolveRasterizedMutationTarget.mockResolvedValue(null);
  await applyEditorLayerRasterEffect(createContext() as never);

  mocks.getEditableObject.mockReturnValue(null);
  await updateEditorLayerRasterEffect(createContext() as never);

  mocks.isEditorRasterObject.mockReturnValue(false);
  previewEditorLayerRasterEffect(createContext() as never);

  expect(mocks.applyRasterEffectsToObject).not.toHaveBeenCalled();
});
