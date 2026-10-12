import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from './index.test-support';
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  readFile: vi.fn(),
  journal: vi.fn(),
  lifecycle: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.db,
}));
vi.mock('../infrastructure/mutation-barrier', async (original) => ({
  ...(await original<typeof import('../infrastructure/mutation-barrier')>()),
  runWithDurableAssetLifecycleLock: mocks.lifecycle,
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  readAssetFile: mocks.readFile,
}));
vi.mock('../assets/publication', async (original) => ({
  ...(await original<typeof import('../assets/publication')>()),
  createAssetPublicationJournal: mocks.journal,
  publishReadyJournalWithRetry: mocks.publish,
  cancelAssetPublication: mocks.cancel,
}));
import {
  prepareLibraryProjectBinding,
  readLibraryProjectBindingSource,
} from './library-project-binding';

const ref = {
  assetId: 'body',
  mimeType: 'audio/wav',
  size: 5,
  createdAt: 1,
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/body' },
};
const source = { kind: 'recording' as const, recordingId: 'mic' };
const media = createMediaLibraryEntry({
  id: 'recording:mic',
  kind: 'audio',
  source,
  mimeType: ref.mimeType,
  size: ref.size,
  filename: 'voice.wav',
});
let currentRef: unknown;
beforeEach(() => {
  vi.clearAllMocks();
  currentRef = ref;
  mocks.db.mockResolvedValue({
    transaction: () => ({
      done: Promise.resolve(),
      objectStore: (store: string) => ({
        get: async () =>
          store === 'media_library'
            ? media
            : store === 'recordings'
              ? {
                  id: 'mic',
                  assetId: 'body',
                  filename: 'voice.wav',
                  mimeType: ref.mimeType,
                  size: ref.size,
                  createdAt: 1,
                }
              : currentRef,
      }),
    }),
  });
  mocks.readFile.mockResolvedValue(new File(['bytes'], 'voice.wav', { type: ref.mimeType }));
  mocks.lifecycle.mockImplementation(async (action) => action('permit'));
  mocks.journal.mockImplementation(async (args) => ({ ...args, journalId: 'ready', createdAt: 2 }));
  mocks.publish.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
});

it('publishes an exact existing reference once and keeps accepted bytes', async () => {
  const selected = await readLibraryProjectBindingSource(media.id);
  const prepared = await prepareLibraryProjectBinding(selected, 'private');
  expect(mocks.journal).toHaveBeenCalledWith(
    expect.objectContaining({
      assetRefs: [ref],
      lifecyclePermit: 'permit',
      payload: expect.objectContaining({
        expectedLibrarySource: { mediaId: media.id, source },
        expectedAssetId: null,
        publishToLibrary: false,
        entry: expect.objectContaining({ id: 'private', assetId: 'body', originMediaId: media.id }),
      }),
    })
  );
  await prepared.publish();
  await prepared.publish();
  await prepared.cancel();
  expect(mocks.publish).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
});

it('cancels an unaccepted ready claim through the existing lifecycle owner', async () => {
  const selected = await readLibraryProjectBindingSource(media.id);
  const prepared = await prepareLibraryProjectBinding(selected, 'private');
  await prepared.cancel();
  expect(mocks.cancel).toHaveBeenCalledOnce();
});

it('refuses a changed immutable reference between decoding and preparation without a ready claim', async () => {
  const selected = await readLibraryProjectBindingSource(media.id);
  currentRef = { ...ref, createdAt: 2 };
  await expect(prepareLibraryProjectBinding(selected, 'private')).rejects.toThrow('source changed');
  expect(mocks.journal).not.toHaveBeenCalled();
});

it('leaves a failed byte read outside the transaction and creates no ready claim', async () => {
  const selected = await readLibraryProjectBindingSource(media.id);
  mocks.readFile.mockRejectedValueOnce(new Error('missing bytes'));
  await expect(prepareLibraryProjectBinding(selected, 'private')).rejects.toThrow('missing bytes');
  expect(mocks.journal).not.toHaveBeenCalled();
});
