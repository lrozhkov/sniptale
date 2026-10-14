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
  'retains accepted local Image projects with the %s category configured',
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
        lifecycle: expect.objectContaining({ storageClass: 'library', savedAt: 10 }),
      })
    );
  }
);

it.each(['temporary', 'library'] as const)(
  'retains an existing %s image without loading category settings',
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
        lifecycle: expect.objectContaining({
          storageClass: 'library',
          savedAt: storageClass === 'library' ? 2 : 10,
        }),
      })
    );
  }
);

it('accepts a new Image project when category settings cannot be read', async () => {
  mocks.loadSettings.mockRejectedValue(new Error('unavailable'));
  const puts = installTransaction({ sourceId: 'new-image' });
  await commitImageWorkspace({
    aggregateId: 'new-image',
    document: createEditorDocumentFixture(),
    expectedRevision: 0,
  });
  expect(mocks.loadSettings).not.toHaveBeenCalled();
  expect(puts.media).toHaveBeenLastCalledWith(
    expect.objectContaining({ lifecycle: expect.objectContaining({ storageClass: 'library' }) })
  );
});

it('replays permanent project admission after settings change', async () => {
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

it.each([undefined, 'temporary', 'library', 'delete', null])(
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
    if (
      initialStorageClass === undefined ||
      initialStorageClass === 'temporary' ||
      initialStorageClass === 'library'
    ) {
      await imageWorkspacePublicationAdapter.publish(replay);
      expect(puts.media).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lifecycle: expect.objectContaining({ storageClass: 'library' }),
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
