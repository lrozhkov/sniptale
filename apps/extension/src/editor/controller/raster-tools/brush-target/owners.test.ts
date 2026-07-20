// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRasterTargetSnapshot: vi.fn(),
  isEditableObject: vi.fn((target: { editable?: boolean }) => target.editable !== false),
  isImageLayerStyleObject: vi.fn((target: { image?: boolean }) => target.image === true),
  mapScenePointToBitmap: vi.fn((_snapshot, point: { x: number; y: number }) => point),
  resolveBitmapPoint: vi.fn(() => ({ x: 2, y: 3 })),
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isEditableObject: mocks.isEditableObject,
}));
vi.mock('../../../objects/image-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/image-style')>()),
  isImageLayerStyleObject: mocks.isImageLayerStyleObject,
}));
vi.mock('../../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/target')>()),
  createRasterTargetSnapshot: mocks.createRasterTargetSnapshot,
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  mapScenePointToBitmap: mocks.mapScenePointToBitmap,
}));

import { resolveBrushBitmapPoint, resolveBrushDraftBitmapPoint } from './bitmap-point';
import { resolveBrushCursorStatus } from './cursor-status';
import { resolveBrushTargetIntent } from './intent';

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
  mocks.createRasterTargetSnapshot.mockResolvedValue(createSnapshot());
});

it('keeps image target intent resolution in the intent owner', async () => {
  const target = { image: true, sniptaleId: 'image-1', sniptaleType: 'image', visible: true };
  const intent = await resolveBrushTargetIntent(
    { nextLabelIndex: () => 1 } as never,
    createCanvas([target]) as never
  );

  expect(intent.kind).toBe('existing');
  expect(mocks.createRasterTargetSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ object: target })
  );
});

it('keeps bitmap point projection in the bitmap-point owner', () => {
  const snapshot = createSnapshot();

  expect(resolveBrushDraftBitmapPoint({ x: 20, y: 10 } as never, snapshot)).toEqual({
    x: 19,
    y: 9,
  });
  expect(resolveBrushDraftBitmapPoint({ x: -1, y: 1 } as never, snapshot)).toBeNull();
  expect(
    resolveBrushBitmapPoint(createCanvas([]) as never, { x: 1, y: 1 } as never, {
      kind: 'blocked',
    })
  ).toBeNull();
});

it('keeps cursor status policy in the cursor-status owner', () => {
  expect(resolveBrushCursorStatus({ canvas: createCanvas([]) as never })).toBe('ready');
  expect(
    resolveBrushCursorStatus({ canvas: createCanvas([{ image: true }, { image: true }]) as never })
  ).toBe('multiple');
  expect(
    resolveBrushCursorStatus({
      canvas: createCanvas([{ image: true, sniptaleLocked: true, sniptaleType: 'image' }]) as never,
    })
  ).toBe('locked');
});
