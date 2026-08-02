import { expect, it, vi } from 'vitest';
import { createRecordingStagingErasureParticipant } from './recording-staging-participant';

it('erases staging and verifies emptiness without mutating during verification', async () => {
  const adapter = {
    countSessions: vi.fn().mockResolvedValue(0),
    erase: vi.fn().mockResolvedValue(3),
  };
  const participant = createRecordingStagingErasureParticipant(adapter);

  await expect(participant.erase()).resolves.toEqual({
    id: 'opfs:recording-staging',
    removedCount: 3,
    severity: 'required',
    status: 'erased',
  });
  await expect(participant.verifyEmpty()).resolves.toEqual({
    id: 'opfs:recording-staging',
    remainingCount: 0,
    severity: 'required',
    status: 'verified-empty',
  });

  expect(adapter.erase).toHaveBeenCalledOnce();
  expect(adapter.countSessions).toHaveBeenCalledOnce();
});

it('fails verification when an OPFS staging session remains', async () => {
  const participant = createRecordingStagingErasureParticipant({
    countSessions: vi.fn().mockResolvedValue(1),
    erase: vi.fn().mockResolvedValue(0),
  });

  await expect(participant.verifyEmpty()).resolves.toEqual(
    expect.objectContaining({ remainingCount: 1, status: 'failed' })
  );
});
