import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commitLayerMutation: vi.fn(),
  createRasterizedEditorImage: vi.fn(async () => ({
    sniptaleId: 'merged-layer',
    sniptaleType: 'image',
  })),
  moveObjectToIndex: vi.fn(),
  rasterizeEditorObjects: vi.fn(() => ({
    bounds: { left: 10, top: 20 },
    dataUrl: 'data:image/png;base64,merged',
  })),
  syncSourceFromObject: vi.fn(),
}));

vi.mock('./rasterize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./rasterize')>()),
  createRasterizedEditorImage: mocks.createRasterizedEditorImage,
  rasterizeEditorObjects: mocks.rasterizeEditorObjects,
}));

vi.mock('./mutation-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mutation-shared')>()),
  commitLayerMutation: mocks.commitLayerMutation,
  moveObjectToIndex: mocks.moveObjectToIndex,
  syncSourceFromObject: mocks.syncSourceFromObject,
}));

import { mergeEditorSelectedLayers } from './merge';

function createCanvas(activeObjects: Array<Record<string, unknown>>) {
  const objects = [...activeObjects];

  return {
    add: vi.fn(),
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => objects),
    remove: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function createContext(
  canvas: ReturnType<typeof createCanvas>,
  overrides: Record<string, unknown> = {}
) {
  return {
    canvas,
    createLayerMutationToken: vi.fn(() => 1),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    ...overrides,
  };
}

describe('editor-controller layer-effects merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  runNoOpSuite();
  runMergeIntoSourceSuite();
  runStaleTokenSuite();
  runMergeIntoImageSuite();
});

function runNoOpSuite() {
  it('no-ops when there is no mergeable canvas selection', async () => {
    await mergeEditorSelectedLayers({ canvas: null } as never);
    await mergeEditorSelectedLayers({ canvas: createCanvas([{ sniptaleId: 'one' }]) } as never);

    expect(mocks.createRasterizedEditorImage).not.toHaveBeenCalled();
  });
}

function runMergeIntoSourceSuite() {
  it('merges selected layers into the source layer when the selection includes the source image', async () => {
    const sourceObject = {
      sniptaleId: 'source-image',
      sniptaleLabel: 'Source',
      sniptaleLocked: true,
      sniptaleType: 'source-image',
      visible: true,
    };
    const annotationObject = {
      sniptaleId: 'annotation-1',
      sniptaleLabel: 'Arrow 1',
      sniptaleLocked: false,
      sniptaleType: 'arrow',
      visible: true,
    };
    const canvas = createCanvas([annotationObject, sourceObject]);
    const context = createContext(canvas);

    await mergeEditorSelectedLayers(context as never);

    expect(mocks.createRasterizedEditorImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'source-image',
        name: 'Source',
        role: 'source',
        type: 'source-image',
      })
    );
    expect(canvas.remove).toHaveBeenCalledWith(annotationObject);
    expect(canvas.remove).toHaveBeenCalledWith(sourceObject);
    expect(context.sendFrameObjectsToBack).toHaveBeenCalledOnce();
    expect(mocks.syncSourceFromObject).toHaveBeenCalled();
    expect(mocks.commitLayerMutation).toHaveBeenCalled();
  });
}

function runStaleTokenSuite() {
  it('skips stale async merge results', async () => {
    const firstObject = {
      sniptaleId: 'first',
      sniptaleLabel: 'First',
      sniptaleLocked: false,
      sniptaleType: 'rectangle',
      visible: true,
    };
    const secondObject = {
      sniptaleId: 'second',
      sniptaleLabel: 'Second',
      sniptaleLocked: false,
      sniptaleType: 'ellipse',
      visible: false,
    };
    const canvas = createCanvas([firstObject, secondObject]);

    await mergeEditorSelectedLayers(
      createContext(canvas, { isLayerMutationTokenCurrent: vi.fn(() => false) }) as never
    );
    expect(canvas.remove).not.toHaveBeenCalled();
  });
}

function runMergeIntoImageSuite() {
  it('merges non-source selections into a new raster image layer', async () => {
    const firstObject = {
      sniptaleId: 'first',
      sniptaleLabel: 'First',
      sniptaleLocked: false,
      sniptaleType: 'rectangle',
      visible: true,
    };
    const secondObject = {
      sniptaleId: 'second',
      sniptaleLabel: 'Second',
      sniptaleLocked: false,
      sniptaleType: 'ellipse',
      visible: false,
    };
    const canvas = createCanvas([firstObject, secondObject]);

    await mergeEditorSelectedLayers(createContext(canvas) as never);

    expect(mocks.createRasterizedEditorImage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'second',
        role: 'annotation',
        type: 'image',
        visible: true,
      })
    );
    expect(mocks.moveObjectToIndex).toHaveBeenCalled();
  });
}
