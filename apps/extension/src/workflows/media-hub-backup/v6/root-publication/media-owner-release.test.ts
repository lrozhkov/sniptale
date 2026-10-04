import { expect, it, vi } from 'vitest';
import { buildPhysicalDeleteOperation } from '../../../../composition/persistence/assets';
import { unlinkMediaAssetOwner } from './media-owner-release';

it.each([0, 1])('releases an owner with %i remaining references', async (remaining) => {
  const operation = buildPhysicalDeleteOperation([]);
  const ownerStore = {
    delete: vi.fn(async () => undefined),
    index: vi.fn(() => ({ count: vi.fn(async () => remaining) })),
  };
  const refStore = { delete: vi.fn(async () => undefined) };

  await unlinkMediaAssetOwner({
    assetId: 'physical',
    operation,
    ownerId: 'media',
    ownerKind: 'media-library',
    ownerStore,
    refStore,
    role: 'source',
  });

  expect(ownerStore.delete).toHaveBeenCalledWith(['media-library', 'media', 'source']);
  expect(refStore.delete).toHaveBeenCalledTimes(remaining === 0 ? 1 : 0);
  expect(operation.assetIds).toEqual(remaining === 0 ? ['physical'] : []);
});
