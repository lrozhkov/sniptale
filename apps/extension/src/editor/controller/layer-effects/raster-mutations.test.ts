import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRasterEffectsToObject: vi.fn(),
  commitLayerMutation: vi.fn(),
  createDefaultEditorRasterEffect: vi.fn((id: string) => ({ enabled: true, id })),
  ensureRasterObject: vi.fn(async (_context, object) => object),
  getEditableObject: vi.fn(),
  isEditorRasterObject: vi.fn(() => true),
  previewEditorRasterEffects: vi.fn(),
  syncSourceFromObject: vi.fn(),
  upsertEditorRasterEffect: vi.fn((effects, effect) => [...effects, effect]),
}));

vi.mock('./filters', () => ({
  applyEditorRasterEffects: vi.fn(),
  isEditorRasterObject: mocks.isEditorRasterObject,
  previewEditorRasterEffects: mocks.previewEditorRasterEffects,
  syncEditorRasterEffects: vi.fn(),
}));

vi.mock('./registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registry')>()),
  createDefaultEditorRasterEffect: mocks.createDefaultEditorRasterEffect,
}));

vi.mock('./mutation-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mutation-shared')>()),
  applyRasterEffectsToObject: mocks.applyRasterEffectsToObject,
  commitLayerMutation: mocks.commitLayerMutation,
  ensureRasterObject: mocks.ensureRasterObject,
  getEditableObject: mocks.getEditableObject,
  syncSourceFromObject: mocks.syncSourceFromObject,
  upsertEditorRasterEffect: mocks.upsertEditorRasterEffect,
}));

import {
  applyEditorLayerRasterEffect,
  applyEditorLayerTransformation,
  previewEditorLayerRasterEffect,
  removeEditorLayerRasterEffect,
  resetEditorLayerRasterEffectPreview,
  resizeEditorLayerWithRasterize,
  updateEditorLayerRasterEffect,
} from './raster-mutations';

function createContext() {
  return {
    canvas: { requestRenderAll: vi.fn() },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 1),
    effect: { amount: 0.42, enabled: true, id: 'brightness' },
    id: 'layer-1',
    isLayerMutationTokenCurrent: vi.fn(() => true),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
    transformationId: 'flip-horizontal',
    width: 200,
    height: 100,
  };
}

function createObject() {
  return {
    angle: 0,
    flipX: false,
    flipY: false,
    getScaledHeight: () => 50,
    getScaledWidth: () => 100,
    sniptaleEffects: [],
    rotate: vi.fn(),
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(function apply(this: Record<string, unknown>, payload: Record<string, unknown>) {
      Object.assign(this, payload);
    }),
    setCoords: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('resizes rasterized layers and applies/update/removes raster effects', async () => {
  const context = createContext();
  const object = createObject();
  mocks.getEditableObject.mockReturnValue(object);

  await resizeEditorLayerWithRasterize(context as never);
  await applyEditorLayerRasterEffect(context as never);
  await updateEditorLayerRasterEffect({
    ...context,
    effect: { amount: 0.4, enabled: true, id: 'brightness' },
  } as never);
  removeEditorLayerRasterEffect(context as never);

  expect(object.scaleX).toBe(2);
  expect(object.scaleY).toBe(2);
  expect(mocks.applyRasterEffectsToObject).toHaveBeenCalledTimes(3);
});

it('keeps first-apply payload for configurable raster effects', async () => {
  const gammaContext = {
    ...createContext(),
    effect: { blue: 1.7, enabled: true, green: 0.95, id: 'gamma', red: 1.4 },
  };
  const colorizeContext = {
    ...createContext(),
    effect: { alpha: 0.55, color: '#336699', enabled: true, id: 'colorize' },
  };
  const object = createObject();
  mocks.getEditableObject.mockReturnValue(object);

  await applyEditorLayerRasterEffect(gammaContext as never);
  await applyEditorLayerRasterEffect(colorizeContext as never);

  expect(mocks.createDefaultEditorRasterEffect).not.toHaveBeenCalled();
  expect(mocks.upsertEditorRasterEffect).toHaveBeenNthCalledWith(1, [], gammaContext.effect);
  expect(mocks.upsertEditorRasterEffect).toHaveBeenNthCalledWith(2, [], colorizeContext.effect);
});

it('skips rasterized mutation work when the layer mutation token is stale', async () => {
  const context = {
    ...createContext(),
    isLayerMutationTokenCurrent: vi.fn(() => false),
  };
  mocks.getEditableObject.mockReturnValue(createObject());

  await applyEditorLayerRasterEffect(context as never);

  expect(mocks.applyRasterEffectsToObject).not.toHaveBeenCalled();
});

it('previews and resets raster effects without committing mutations', () => {
  const object = {
    ...createObject(),
    sniptaleEffects: [{ amount: 0.2, enabled: true, id: 'brightness' }],
  };
  const context = createContext();
  mocks.getEditableObject.mockReturnValue(object);

  previewEditorLayerRasterEffect(context as never);
  resetEditorLayerRasterEffectPreview(context as never);

  expect(mocks.previewEditorRasterEffects).toHaveBeenNthCalledWith(1, object, [
    object.sniptaleEffects[0],
    context.effect,
  ]);
  expect(mocks.previewEditorRasterEffects).toHaveBeenNthCalledWith(
    2,
    object,
    object.sniptaleEffects
  );
  expect(context.canvas.requestRenderAll).toHaveBeenCalledTimes(2);
  expect(mocks.applyRasterEffectsToObject).not.toHaveBeenCalled();
});

it('skips raster previews for missing canvas or non-raster objects', () => {
  const context = createContext();
  mocks.getEditableObject.mockReturnValue(createObject());
  mocks.isEditorRasterObject.mockReturnValueOnce(false);

  previewEditorLayerRasterEffect(context as never);
  resetEditorLayerRasterEffectPreview({ ...context, canvas: null } as never);

  expect(mocks.previewEditorRasterEffects).not.toHaveBeenCalled();
  expect(context.canvas.requestRenderAll).not.toHaveBeenCalled();
});

function runRasterMutationTransformationSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies transformation branches and skips resize-layer post-raster transform work', async () => {
    const object = createObject();
    mocks.getEditableObject.mockReturnValue(object);

    await applyEditorLayerTransformation({
      ...createContext(),
      transformationId: 'flip-horizontal',
    } as never);
    await applyEditorLayerTransformation({
      ...createContext(),
      transformationId: 'flip-vertical',
    } as never);
    await applyEditorLayerTransformation({
      ...createContext(),
      transformationId: 'rotate-left',
    } as never);
    await applyEditorLayerTransformation({
      ...createContext(),
      transformationId: 'rotate-right',
    } as never);
    await applyEditorLayerTransformation({
      ...createContext(),
      transformationId: 'resize-layer',
    } as never);

    expect(object.flipX).toBe(true);
    expect(object.flipY).toBe(true);
    expect(object.rotate).toHaveBeenCalledWith(-90);
    expect(object.rotate).toHaveBeenCalledWith(90);
    expect(mocks.commitLayerMutation).toHaveBeenCalledTimes(4);
  });
}

describe(
  'editor-controller layer-effects raster-mutations transformations',
  runRasterMutationTransformationSuite
);
