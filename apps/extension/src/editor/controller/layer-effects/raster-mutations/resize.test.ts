import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commitLayerMutation: vi.fn(),
  syncSourceFromObject: vi.fn(),
  resolveRasterizedMutationTarget: vi.fn(),
}));

vi.mock('../mutation-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mutation-shared')>()),
  commitLayerMutation: mocks.commitLayerMutation,
  syncSourceFromObject: mocks.syncSourceFromObject,
}));
vi.mock('./target', () => ({
  resolveRasterizedMutationTarget: mocks.resolveRasterizedMutationTarget,
}));

import { resizeEditorLayerWithRasterize } from './resize';

beforeEach(() => {
  vi.clearAllMocks();
});

it('resizes raster targets and commits source/runtime state', async () => {
  const target = {
    getScaledHeight: () => 50,
    getScaledWidth: () => 100,
    scaleX: 1,
    scaleY: 1,
    set: vi.fn(function set(
      this: { scaleX: number; scaleY: number },
      patch: Record<string, number>
    ) {
      Object.assign(this, patch);
    }),
    setCoords: vi.fn(),
  };
  const canvas = {};
  const context = { canvas, height: 100, id: 'layer-1', width: 200 };
  mocks.resolveRasterizedMutationTarget.mockResolvedValue({ canvas, target });

  await resizeEditorLayerWithRasterize(context as never);

  expect(target.scaleX).toBe(2);
  expect(target.scaleY).toBe(2);
  expect(target.setCoords).toHaveBeenCalledOnce();
  expect(mocks.syncSourceFromObject).toHaveBeenCalledWith(context, target);
  expect(mocks.commitLayerMutation).toHaveBeenCalledWith(context, canvas);
});

it('skips invalid raster resize targets', async () => {
  mocks.resolveRasterizedMutationTarget.mockResolvedValueOnce(null);
  await resizeEditorLayerWithRasterize({ id: 'layer-1' } as never);

  mocks.resolveRasterizedMutationTarget.mockResolvedValueOnce({
    canvas: {},
    target: { getScaledHeight: () => 0, getScaledWidth: () => 100 },
  });
  await resizeEditorLayerWithRasterize({ id: 'layer-1' } as never);

  expect(mocks.commitLayerMutation).not.toHaveBeenCalled();
});
