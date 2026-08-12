import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ moveAIModel: vi.fn(), toastError: vi.fn() }));

vi.mock('../../../../runtime/ai-settings/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../runtime/ai-settings/mutations')>()),
  moveAIModel: mocks.moveAIModel,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError },
}));

import { createAiProvidersModelMoveHandler } from './model-order';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.moveAIModel.mockResolvedValue(undefined);
});

it('persists a model move and reloads the canonical order', async () => {
  const reloadData = vi.fn().mockResolvedValue(undefined);
  await expect(createAiProvidersModelMoveHandler(reloadData)('model-2', 'model-1')).resolves.toBe(
    true
  );

  expect(mocks.moveAIModel).toHaveBeenCalledWith('model-2', 'model-1');
  expect(reloadData).toHaveBeenCalledOnce();
});

it('surfaces a failed model move without reloading stale data', async () => {
  const reloadData = vi.fn().mockResolvedValue(undefined);
  mocks.moveAIModel.mockRejectedValue(new Error('failed'));

  await expect(createAiProvidersModelMoveHandler(reloadData)('model-2', null)).resolves.toBe(false);

  expect(reloadData).not.toHaveBeenCalled();
  expect(mocks.toastError).toHaveBeenCalledOnce();
});

it('serializes move reconciliation so an older reload cannot overwrite a newer move', async () => {
  let releaseFirstReload: (() => void) | undefined;
  const firstReload = new Promise<void>((resolve) => {
    releaseFirstReload = resolve;
  });
  const reloadData = vi
    .fn<() => Promise<void>>()
    .mockReturnValueOnce(firstReload)
    .mockResolvedValueOnce(undefined);
  const moveModel = createAiProvidersModelMoveHandler(reloadData);

  const firstMove = moveModel('model-2', 'model-1');
  const secondMove = moveModel('model-1', null);
  await Promise.resolve();

  expect(mocks.moveAIModel).toHaveBeenCalledTimes(1);
  expect(mocks.moveAIModel).toHaveBeenNthCalledWith(1, 'model-2', 'model-1');

  releaseFirstReload?.();
  await expect(firstMove).resolves.toBe(true);
  await expect(secondMove).resolves.toBe(true);

  expect(mocks.moveAIModel).toHaveBeenNthCalledWith(2, 'model-1', null);
  expect(reloadData).toHaveBeenCalledTimes(2);
});

it('surfaces a failed post-commit reload to the move caller', async () => {
  const reloadData = vi.fn().mockRejectedValue(new Error('reload failed'));

  await expect(createAiProvidersModelMoveHandler(reloadData)('model-2', null)).resolves.toBe(false);

  expect(mocks.moveAIModel).toHaveBeenCalledOnce();
  expect(mocks.toastError).toHaveBeenCalledOnce();
});
