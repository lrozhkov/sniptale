// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRasterTargetSnapshot: vi.fn(),
  isEditableObject: vi.fn((target: { editable?: boolean }) => target.editable !== false),
  isImageLayerStyleObject: vi.fn((target: { image?: boolean }) => target.image === true),
  mapScenePointToBitmap: vi.fn((_snapshot, point: { x: number; y: number }) => point),
  resolveBitmapPoint: vi.fn(() => ({ x: 2, y: 3 })),
}));

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  isEditableObject: mocks.isEditableObject,
}));

vi.mock('../../objects/image-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/image-style')>()),
  isImageLayerStyleObject: mocks.isImageLayerStyleObject,
}));

vi.mock('../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  mapScenePointToBitmap: mocks.mapScenePointToBitmap,
}));

import {
  resolveBrushBitmapPoint,
  resolveBrushCursorStatus,
  resolveBrushDraftBitmapPoint,
  resolveBrushTargetIntent,
} from './brush-target';

function createBindings() {
  return {
    getCanvasDocumentSize: () => ({ height: 10, width: 20 }),
    nextLabelIndex: () => 1,
  };
}

function createCanvas(activeObjects: unknown[] = []) {
  return {
    getActiveObjects: () => activeObjects,
  };
}

function createSnapshot() {
  const bitmap = document.createElement('canvas');
  bitmap.width = 20;
  bitmap.height = 10;
  return {
    bitmap,
    reference: { kind: 'object' as const, objectId: 'image-1', objectName: 'Image 1' },
    sceneBounds: { height: 10, left: 0, top: 0, width: 20 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEditableObject.mockReturnValue(true);
  mocks.isImageLayerStyleObject.mockImplementation((target: { image?: boolean }) => {
    return target.image === true;
  });
  mocks.createRasterTargetSnapshot.mockResolvedValue(createSnapshot());
});

it('resolves existing image targets and delegates point projection to the raster target owner', async () => {
  const target = {
    image: true,
    sniptaleId: 'image-1',
    sniptaleLabel: 'Image 1',
    sniptaleType: 'image',
    visible: true,
  };
  const canvas = createCanvas([target]);

  const intent = await resolveBrushTargetIntent(createBindings() as never, canvas as never);
  const point = resolveBrushBitmapPoint(canvas as never, { x: 4, y: 5 } as never, intent);

  expect(intent.kind).toBe('existing');
  expect(mocks.createRasterTargetSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ object: target })
  );
  expect(point).toEqual({ x: 2, y: 3 });
});

it('creates brush layer intents for missing, hidden, or vector targets', async () => {
  expect(
    (await resolveBrushTargetIntent(createBindings() as never, createCanvas([]) as never)).kind
  ).toBe('create');
  expect(
    (
      await resolveBrushTargetIntent(
        createBindings() as never,
        createCanvas([{ editable: false }]) as never
      )
    ).kind
  ).toBe('create');
  expect(
    (
      await resolveBrushTargetIntent(
        createBindings() as never,
        createCanvas([{ visible: false }]) as never
      )
    ).kind
  ).toBe('create');
});

it('blocks multiple selections and locked non-base targets while allowing locked base images', async () => {
  expect(
    (
      await resolveBrushTargetIntent(
        createBindings() as never,
        createCanvas([{ image: true }, { image: true }]) as never
      )
    ).kind
  ).toBe('blocked');
  expect(
    (
      await resolveBrushTargetIntent(
        createBindings() as never,
        createCanvas([
          { image: true, sniptaleLocked: true, sniptaleType: 'image', visible: true },
        ]) as never
      )
    ).kind
  ).toBe('blocked');
  expect(
    (
      await resolveBrushTargetIntent(
        createBindings() as never,
        createCanvas([
          { image: true, sniptaleLocked: true, sniptaleType: 'source-image', visible: true },
        ]) as never
      )
    ).kind
  ).toBe('existing');
});

it('clamps brush layer bitmap points and reports cursor statuses', () => {
  const snapshot = createSnapshot();

  expect(resolveBrushDraftBitmapPoint({ x: 999, y: 999 } as never, snapshot)).toBeNull();
  expect(resolveBrushDraftBitmapPoint({ x: 20, y: 10 } as never, snapshot)).toEqual({
    x: 19,
    y: 9,
  });
  expect(
    resolveBrushBitmapPoint(createCanvas([]) as never, { x: 1, y: 1 } as never, {
      kind: 'blocked',
    })
  ).toBeNull();
  expect(resolveBrushCursorStatus({ canvas: createCanvas([]) as never })).toBe('ready');
  expect(
    resolveBrushCursorStatus({
      canvas: createCanvas([{ image: true }, { image: true }]) as never,
    })
  ).toBe('multiple');
  expect(
    resolveBrushCursorStatus({
      canvas: createCanvas([{ image: true, sniptaleLocked: true, sniptaleType: 'image' }]) as never,
    })
  ).toBe('locked');
});
