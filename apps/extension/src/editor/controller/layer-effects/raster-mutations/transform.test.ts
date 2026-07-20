import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commitLayerMutation: vi.fn(),
  ensureRasterObject: vi.fn(async (_context, object) => object),
  getEditableObject: vi.fn(),
  syncSourceFromObject: vi.fn(),
}));

vi.mock('../mutation-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mutation-shared')>()),
  commitLayerMutation: mocks.commitLayerMutation,
  ensureRasterObject: mocks.ensureRasterObject,
  getEditableObject: mocks.getEditableObject,
  syncSourceFromObject: mocks.syncSourceFromObject,
}));

import { applyEditorLayerTransformation } from './transform';

beforeEach(() => {
  vi.clearAllMocks();
});

function createContext(transformationId: string) {
  return {
    canvas: {},
    createLayerMutationToken: vi.fn(() => 1),
    id: 'layer-1',
    isLayerMutationTokenCurrent: vi.fn(() => true),
    transformationId,
  };
}

function createObject() {
  return {
    angle: 0,
    flipX: false,
    flipY: false,
    rotate: vi.fn(),
    set: vi.fn(function set(this: Record<string, unknown>, patch: Record<string, unknown>) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
  };
}

it('applies raster layer transformation branches and commits non-resize changes', async () => {
  const object = createObject();
  mocks.getEditableObject.mockReturnValue(object);

  await applyEditorLayerTransformation(createContext('flip-horizontal') as never);
  await applyEditorLayerTransformation(createContext('flip-vertical') as never);
  await applyEditorLayerTransformation(createContext('rotate-left') as never);
  await applyEditorLayerTransformation(createContext('rotate-right') as never);
  await applyEditorLayerTransformation(createContext('resize-layer') as never);

  expect(object.flipX).toBe(true);
  expect(object.flipY).toBe(true);
  expect(object.rotate).toHaveBeenCalledWith(-90);
  expect(object.rotate).toHaveBeenCalledWith(90);
  expect(mocks.commitLayerMutation).toHaveBeenCalledTimes(4);
});

it('skips stale or missing transformation targets', async () => {
  mocks.getEditableObject.mockReturnValue(null);
  await applyEditorLayerTransformation(createContext('flip-horizontal') as never);

  const stale = {
    ...createContext('resize-layer'),
    isLayerMutationTokenCurrent: vi.fn(() => false),
  };
  mocks.getEditableObject.mockReturnValue(createObject());
  await applyEditorLayerTransformation(stale as never);

  expect(mocks.commitLayerMutation).not.toHaveBeenCalled();
});
