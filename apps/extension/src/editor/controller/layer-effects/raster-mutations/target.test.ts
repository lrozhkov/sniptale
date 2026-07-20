import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureRasterObject: vi.fn(async (_context, object) => object),
  getEditableObject: vi.fn(),
}));

vi.mock('../mutation-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mutation-shared')>()),
  ensureRasterObject: mocks.ensureRasterObject,
  getEditableObject: mocks.getEditableObject,
}));

import { resolveRasterizedMutationTarget } from './target';

beforeEach(() => {
  vi.clearAllMocks();
});

function createContext() {
  return {
    canvas: { requestRenderAll: vi.fn() },
    createLayerMutationToken: vi.fn(() => 1),
    id: 'layer-1',
    isLayerMutationTokenCurrent: vi.fn(() => true),
  };
}

it('resolves rasterized mutation targets when canvas, object, and token are current', async () => {
  const object = { sniptaleId: 'layer-1' };
  const context = createContext();
  mocks.getEditableObject.mockReturnValue(object);

  await expect(resolveRasterizedMutationTarget(context as never)).resolves.toEqual({
    canvas: context.canvas,
    target: object,
  });
});

it('skips stale or missing rasterized mutation targets', async () => {
  const context = { ...createContext(), isLayerMutationTokenCurrent: vi.fn(() => false) };
  mocks.getEditableObject.mockReturnValue({ sniptaleId: 'layer-1' });

  await expect(resolveRasterizedMutationTarget(context as never)).resolves.toBeNull();

  mocks.getEditableObject.mockReturnValue(null);
  await expect(resolveRasterizedMutationTarget(createContext() as never)).resolves.toBeNull();
});
