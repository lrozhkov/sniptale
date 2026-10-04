import { installTransaction, getImageMutationMocks, root } from './mutations.test-support';
import { expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { commitImageWorkspace, imageWorkspacePublicationAdapter } from './mutations';

it('does not recreate a purged original image on the first editor save', async () => {
  const puts = installTransaction({ sourceId: 'image-1' });
  const input = {
    aggregateId: 'image-1',
    document: createEditorDocumentFixture(),
    expectedRevision: 0,
    requireExistingRoot: true,
  };
  await expect(commitImageWorkspace(input)).rejects.toThrow();
  expect(puts.media).not.toHaveBeenCalled();
  expect(puts.workspace).not.toHaveBeenCalled();
});

const mocks = getImageMutationMocks();

it.each(['temporary', 'library'] as const)(
  'creates local images in the configured %s category',
  async (storageClass) => {
    mocks.loadSettings.mockResolvedValue({
      localStoragePolicy: { defaultDestination: storageClass },
    });
    const puts = installTransaction({ sourceId: 'new-image' });
    await commitImageWorkspace({
      aggregateId: 'new-image',
      document: createEditorDocumentFixture(),
      expectedRevision: 0,
    });
    expect(puts.media).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'new-image',
        lifecycle: expect.objectContaining({ storageClass }),
      })
    );
  }
);

it.each(['temporary', 'library'] as const)(
  'preserves an existing %s image without loading category settings',
  async (storageClass) => {
    const media = {
      ...root(0),
      lifecycle: { storageClass, savedAt: storageClass === 'library' ? 2 : null, updatedAt: 2 },
    };
    const puts = installTransaction({ media });
    mocks.loadSettings.mockRejectedValue(new Error('unavailable'));
    await commitImageWorkspace({
      aggregateId: media.id,
      document: createEditorDocumentFixture(),
      expectedRevision: 0,
      requireExistingRoot: true,
    });
    expect(mocks.loadSettings).not.toHaveBeenCalled();
    expect(puts.media).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lifecycle: expect.objectContaining({ storageClass, savedAt: media.lifecycle.savedAt }),
      })
    );
  }
);

it('fails before staging new bytes when category settings cannot be read', async () => {
  const assets = await import('../assets');
  mocks.loadSettings.mockRejectedValue(new Error('unavailable'));
  installTransaction({ sourceId: 'new-image' });
  await expect(
    commitImageWorkspace({
      aggregateId: 'new-image',
      document: createEditorDocumentFixture(),
      expectedRevision: 0,
    })
  ).rejects.toThrow('unavailable');
  expect(assets.writeBlobToAsset).not.toHaveBeenCalled();
  expect(assets.createAssetPublicationJournal).not.toHaveBeenCalled();
});

it('replays the chosen category after settings change, without another policy read', async () => {
  const assets = await import('../assets');
  const puts = installTransaction({ sourceId: 'new-image' });
  mocks.loadSettings.mockResolvedValue({ localStoragePolicy: { defaultDestination: 'library' } });
  vi.mocked(assets.publishReadyJournalWithRetry).mockRejectedValueOnce(new Error('interrupted'));
  await expect(
    commitImageWorkspace({
      aggregateId: 'new-image',
      document: createEditorDocumentFixture(),
      expectedRevision: 0,
    })
  ).rejects.toThrow('interrupted');
  expect(puts.media).not.toHaveBeenCalled();
  const journal = await vi.mocked(assets.createAssetPublicationJournal).mock.results[0]!.value;
  mocks.loadSettings.mockClear();
  mocks.loadSettings.mockRejectedValue(new Error('settings changed/unavailable'));
  await imageWorkspacePublicationAdapter.publish(journal);
  expect(mocks.loadSettings).not.toHaveBeenCalled();
  expect(puts.media).toHaveBeenLastCalledWith(
    expect.objectContaining({
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
    })
  );
});

it.each([undefined, 'delete', null])(
  'validates creation policy on replay: %s',
  async (initialStorageClass) => {
    const assets = await import('../assets');
    const puts = installTransaction({ sourceId: 'new-image' });
    mocks.loadSettings.mockResolvedValue({ localStoragePolicy: { defaultDestination: 'library' } });
    vi.mocked(assets.publishReadyJournalWithRetry).mockRejectedValueOnce(new Error('interrupted'));
    await expect(
      commitImageWorkspace({
        aggregateId: 'new-image',
        document: createEditorDocumentFixture(),
        expectedRevision: 0,
      })
    ).rejects.toThrow('interrupted');
    const journal = await vi.mocked(assets.createAssetPublicationJournal).mock.results[0]!.value;
    const replay = { ...journal, payload: { ...journal.payload, initialStorageClass } };
    mocks.loadSettings.mockClear();
    if (initialStorageClass === undefined) {
      await imageWorkspacePublicationAdapter.publish(replay);
      expect(puts.media).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lifecycle: expect.objectContaining({ storageClass: 'temporary' }),
        })
      );
    } else {
      await expect(imageWorkspacePublicationAdapter.publish(replay)).rejects.toThrow(
        'Invalid image workspace publication payload'
      );
      expect(puts.media).not.toHaveBeenCalled();
    }
    expect(mocks.loadSettings).not.toHaveBeenCalled();
  }
);
