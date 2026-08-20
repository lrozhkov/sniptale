import { expect, it, vi } from 'vitest';
import { createAssetStorageErasureParticipant } from './asset-storage-participant';

it('erases durable and legacy OPFS roots and verifies without mutating', async () => {
  const adapter = {
    countRoots: vi.fn().mockResolvedValue(0),
    erase: vi.fn().mockResolvedValue(2),
  };
  const participant = createAssetStorageErasureParticipant(adapter);

  await expect(participant.erase()).resolves.toEqual({
    id: 'opfs:durable-assets',
    removedCount: 2,
    severity: 'required',
    status: 'erased',
  });
  await expect(participant.verifyEmpty()).resolves.toEqual({
    id: 'opfs:durable-assets',
    remainingCount: 0,
    severity: 'required',
    status: 'verified-empty',
  });
  expect(adapter.erase).toHaveBeenCalledOnce();
  expect(adapter.countRoots).toHaveBeenCalledOnce();
});

it('fails required verification while either OPFS root remains', async () => {
  const participant = createAssetStorageErasureParticipant({
    countRoots: vi.fn().mockResolvedValue(1),
    erase: vi.fn().mockResolvedValue(0),
  });

  await expect(participant.verifyEmpty()).resolves.toEqual(
    expect.objectContaining({ remainingCount: 1, status: 'failed' })
  );
});
