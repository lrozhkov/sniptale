import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyEditorRasterEffects: vi.fn(),
  buildRasterizedSourceState: vi.fn((source, object) => ({
    source,
    syncedFrom: object.sniptaleId,
  })),
  createRasterizedEditorImage: vi.fn(async () => ({
    sniptaleId: 'replacement',
    sniptaleType: 'image',
  })),
  findObjectById: vi.fn(),
  isEditorRasterLayerType: vi.fn((type: string) => type === 'image' || type === 'source-image'),
  isEditorRasterObject: vi.fn(() => true),
  rasterizeEditorObjects: vi.fn(() => ({
    bounds: { left: 10, top: 20 },
    dataUrl: 'data:image/png;base64,replacement',
  })),
}));

vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  findObjectById: mocks.findObjectById,
}));

vi.mock('./filters', () => ({
  applyEditorRasterEffects: mocks.applyEditorRasterEffects,
  isEditorRasterObject: mocks.isEditorRasterObject,
  previewEditorRasterEffects: vi.fn(),
  syncEditorRasterEffects: vi.fn(),
}));

vi.mock('./rasterize/source-state', () => ({
  buildRasterizedSourceState: mocks.buildRasterizedSourceState,
}));

vi.mock('./rasterize/image-object', () => ({
  createRasterizedEditorImage: mocks.createRasterizedEditorImage,
}));

vi.mock('./rasterize/layer-type', () => ({
  isEditorRasterLayerType: mocks.isEditorRasterLayerType,
}));

vi.mock('./rasterize/render-data', () => ({
  rasterizeEditorObjects: mocks.rasterizeEditorObjects,
}));

import {
  applyRasterEffectsToObject,
  commitLayerMutation,
  ensureRasterObject,
  getEditableObject,
  upsertEditorRasterEffect,
} from './mutation-shared';

function createContext() {
  const canvas = {
    add: vi.fn(),
    getObjects: vi.fn(() => [{ sniptaleId: 'vector-layer' }]),
    moveObjectTo: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };

  return {
    canvas,
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 1),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

function createVectorObject(overrides: Record<string, unknown> = {}) {
  return {
    sniptaleId: 'vector-layer',
    sniptaleLabel: 'Vector Layer',
    sniptaleLocked: false,
    sniptaleType: 'rectangle',
    visible: true,
    ...overrides,
  };
}

describe('editor-controller layer-effects mutation-shared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  runEditableObjectSuite();
  runRasterizeCommitSuite();
  runExistingRasterSuite();
  runFailureBranchesSuite();
  runSourceReplacementSuite();
});

function runEditableObjectSuite() {
  it('finds editable objects and upserts raster effects by id', () => {
    mocks.findObjectById
      .mockReturnValueOnce({ sniptaleId: 'layer-1' })
      .mockReturnValueOnce({ sniptaleId: 'locked', sniptaleLocked: true });

    expect(getEditableObject({} as never, 'layer-1')).toEqual({ sniptaleId: 'layer-1' });
    expect(getEditableObject({} as never, 'locked')).toBeNull();
    expect(getEditableObject(null, 'missing')).toBeNull();
    expect(
      upsertEditorRasterEffect([{ amount: 0.2, enabled: true, id: 'brightness' }], {
        amount: 0.4,
        enabled: true,
        id: 'brightness',
      })
    ).toEqual([{ amount: 0.4, enabled: true, id: 'brightness' }]);
  });
}

function runRasterizeCommitSuite() {
  it('rasterizes non-raster objects and commits raster effect mutations', async () => {
    const context = createContext();
    const vectorObject = createVectorObject();
    const rasterObject = { sniptaleId: 'image-layer' };

    const replacement = await ensureRasterObject(context as never, vectorObject as never, 1);
    applyRasterEffectsToObject(
      context as never,
      rasterObject as never,
      [{ amount: 0.3, enabled: true, id: 'brightness' }],
      context.canvas as never
    );
    commitLayerMutation(context as never, context.canvas as never);

    expect(replacement).toEqual({ sniptaleId: 'replacement', sniptaleType: 'image' });
    expect(context.prepareObject).toHaveBeenCalled();
    expect(context.canvas.remove).toHaveBeenCalledWith(vectorObject);
    expect(context.canvas.add).toHaveBeenCalled();
    expect(context.setSource).toHaveBeenCalled();
    expect(mocks.applyEditorRasterEffects).toHaveBeenCalledWith(rasterObject, [
      { amount: 0.3, enabled: true, id: 'brightness' },
    ]);
    expect(context.commitHistory).toHaveBeenCalled();
    expect(context.syncRuntimeState).toHaveBeenCalled();
  });
}

function runExistingRasterSuite() {
  it('returns the original object for raster layers and ignores non-raster effect application targets', async () => {
    const context = createContext();
    const rasterObject = { sniptaleId: 'image-layer', sniptaleType: 'image' };
    mocks.isEditorRasterObject.mockReturnValueOnce(false);

    expect(await ensureRasterObject(context as never, rasterObject as never, 1)).toBe(rasterObject);
    applyRasterEffectsToObject(
      context as never,
      rasterObject as never,
      [{ enabled: true, id: 'sepia' }],
      context.canvas as never
    );

    expect(mocks.applyEditorRasterEffects).not.toHaveBeenCalled();
  });
}

function runFailureBranchesSuite() {
  it('returns null when rasterization cannot proceed or a mutation token becomes stale', async () => {
    const context = createContext();
    const vectorObject = createVectorObject();

    mocks.rasterizeEditorObjects.mockReturnValueOnce(null as never);
    expect(
      await ensureRasterObject({ ...context, canvas: null } as never, vectorObject as never, 1)
    ).toBeNull();
    expect(await ensureRasterObject(context as never, vectorObject as never, 1)).toBeNull();

    mocks.rasterizeEditorObjects.mockReturnValueOnce({
      bounds: { left: 1, top: 2 },
      dataUrl: 'data:image/png;base64,replacement',
    });

    expect(
      await ensureRasterObject(
        { ...context, isLayerMutationTokenCurrent: vi.fn(() => false) } as never,
        vectorObject as never,
        1
      )
    ).toBeNull();
  });
}

function runSourceReplacementSuite() {
  it('sends the frame behind replacement source images', async () => {
    const context = createContext();
    mocks.createRasterizedEditorImage.mockResolvedValueOnce({
      sniptaleId: 'source-image',
      sniptaleType: 'source-image',
    });

    await ensureRasterObject(
      context as never,
      createVectorObject({ sniptaleId: 'source-image' }) as never,
      1
    );

    expect(context.sendFrameObjectsToBack).toHaveBeenCalledOnce();
  });
}
