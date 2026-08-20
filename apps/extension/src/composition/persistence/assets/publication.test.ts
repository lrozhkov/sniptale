import { beforeEach, expect, it, vi } from 'vitest';

const {
  deleteReadyJournalMock,
  listReadyJournalsMock,
  releaseTransitionsMock,
  writeReadyJournalMock,
} = vi.hoisted(() => ({
  deleteReadyJournalMock: vi.fn(),
  listReadyJournalsMock: vi.fn(),
  releaseTransitionsMock: vi.fn(),
  writeReadyJournalMock: vi.fn(),
}));

vi.mock('./opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opfs-store')>()),
  deleteReadyJournal: deleteReadyJournalMock,
  listReadyJournals: listReadyJournalsMock,
  releaseAssetPublicationTransitions: releaseTransitionsMock,
  writeReadyJournal: writeReadyJournalMock,
}));

import { createAssetPublicationJournal, publishReadyJournalWithRetry } from './publication';
import { recoverStandaloneAssetPublications } from './recovery';
import type { AssetReadyJournal } from './contracts';

const ref = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
};

function createJournal(overrides: Partial<AssetReadyJournal> = {}): AssetReadyJournal {
  return {
    assetRefs: [ref],
    createdAt: 1,
    domain: 'recording-assets',
    journalId: 'journal-1',
    payload: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteReadyJournalMock.mockResolvedValue(undefined);
  releaseTransitionsMock.mockResolvedValue(undefined);
  writeReadyJournalMock.mockResolvedValue(undefined);
});

it('persists ready before publication and removes it only after a successful retry', async () => {
  const journal = await createAssetPublicationJournal({
    assetRefs: [ref],
    domain: 'recording-assets',
    payload: { recordingId: 'recording-1' },
  });
  const publish = vi
    .fn()
    .mockRejectedValueOnce(new Error('transaction failed'))
    .mockResolvedValueOnce(undefined);

  await publishReadyJournalWithRetry(journal, publish);

  expect(writeReadyJournalMock).toHaveBeenCalledWith(journal);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(deleteReadyJournalMock).toHaveBeenCalledWith(journal.journalId);
  expect(releaseTransitionsMock).toHaveBeenCalledWith(['asset-1']);
});

it('binds workflow publications to their durable operation', async () => {
  const journal = await createAssetPublicationJournal({
    assetRefs: [ref],
    domain: 'recording-assets',
    operationId: 'restore-1',
    payload: {},
  });

  expect(journal.operationId).toBe('restore-1');
  expect(writeReadyJournalMock).toHaveBeenCalledWith(journal);
});

it('keeps ready durable after bounded immediate retries are exhausted', async () => {
  const journal = createJournal();
  const publish = vi.fn().mockRejectedValue(new Error('transaction failed'));

  await expect(publishReadyJournalWithRetry(journal, publish)).rejects.toThrow(
    'transaction failed'
  );

  expect(publish).toHaveBeenCalledTimes(3);
  expect(deleteReadyJournalMock).not.toHaveBeenCalled();
  expect(releaseTransitionsMock).toHaveBeenCalledWith(['asset-1']);
});

it('surfaces both publication and transition-release failures', async () => {
  const journal = createJournal();
  const publicationError = new Error('transaction failed');
  const releaseError = new Error('transition release failed');
  const publish = vi.fn().mockRejectedValue(publicationError);
  releaseTransitionsMock.mockRejectedValueOnce(releaseError);

  await expect(publishReadyJournalWithRetry(journal, publish)).rejects.toMatchObject({
    cause: publicationError,
    errors: [publicationError, releaseError],
  });
});

it('keeps a successful publication successful when ready cleanup must be replayed', async () => {
  const journal = createJournal();
  const publish = vi.fn().mockResolvedValue(undefined);
  deleteReadyJournalMock.mockRejectedValue(new Error('OPFS cleanup failed'));

  await expect(publishReadyJournalWithRetry(journal, publish)).resolves.toBeUndefined();

  expect(publish).toHaveBeenCalledOnce();
  expect(deleteReadyJournalMock).toHaveBeenCalledWith(journal.journalId);

  deleteReadyJournalMock.mockResolvedValue(undefined);
  listReadyJournalsMock.mockResolvedValue([journal]);
  await expect(
    recoverStandaloneAssetPublications([{ domain: journal.domain, publish }])
  ).resolves.toBe(1);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(deleteReadyJournalMock).toHaveBeenCalledTimes(2);
});

it('replays only standalone journals with a registered domain adapter', async () => {
  const standalone = createJournal();
  const workflow = createJournal({ journalId: 'workflow', operationId: 'restore-1' });
  const unknown = createJournal({ domain: 'unknown', journalId: 'unknown' });
  listReadyJournalsMock.mockResolvedValue([standalone, workflow, unknown]);
  const publish = vi.fn().mockResolvedValue(undefined);

  await expect(
    recoverStandaloneAssetPublications([{ domain: 'recording-assets', publish }])
  ).resolves.toBe(1);

  expect(publish).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledWith(standalone);
  expect(deleteReadyJournalMock).toHaveBeenCalledWith('journal-1');
  expect(deleteReadyJournalMock).not.toHaveBeenCalledWith('workflow');
});
