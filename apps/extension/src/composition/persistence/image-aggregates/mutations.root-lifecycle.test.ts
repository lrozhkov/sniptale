import { installTransaction, getImageMutationMocks, root } from './mutations.test-support';
import { expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import {
  commitImagePresentation,
  commitImageWorkspace,
  imageWorkspacePublicationAdapter,
} from './mutations';

it('does not recreate a purged original image on the first editor save', async () => {
  const puts = installTransaction({ sourceId: 'image-1' });
  const document = {
    ...createEditorDocumentFixture(),
    version: 3 as const,
    canvasJson: JSON.stringify({
      objects: [
        {
          sniptaleRasterOriginalData: 'data:image/png;base64,b3JpZ2luYWw=',
          sniptaleRasterColorData: 'data:image/png;base64,Y29sb3I=',
          sniptaleRasterVisibilityData: 'data:image/png;base64,dmlzaWJpbGl0eQ==',
          sniptaleRasterKeyData: 'data:image/png;base64,a2V5',
          sniptaleRasterState: {
            version: 1,
            width: 8,
            height: 6,
            crop: { x: 2, y: 1, width: 4, height: 3 },
          },
        },
      ],
    }),
  };
  const input = {
    aggregateId: 'image-1',
    document,
    expectedRevision: 0,
    requireExistingRoot: true,
  };
  await expect(commitImageWorkspace(input)).rejects.toThrow();
  expect(puts.media).not.toHaveBeenCalled();
  expect(puts.workspace).not.toHaveBeenCalled();
});

const mocks = getImageMutationMocks();

it('saves two independent image projects over one original', async () => {
  const media = {
    ...root(0),
    lifecycle: { storageClass: 'temporary' as const, savedAt: null, updatedAt: 2 },
  };
  const puts = installTransaction({ media });
  const document = createEditorDocumentFixture();
  const original = { mediaId: media.id, generation: null };
  const first = await commitImageWorkspace({
    aggregateId: 'first-project',
    original,
    document,
    expectedRevision: 0,
  });
  const second = await commitImageWorkspace({
    aggregateId: 'second-project',
    original,
    document,
    expectedRevision: 0,
  });
  expect(second.sourceGeneration).not.toBe(first.sourceGeneration);
  expect(puts.workspace).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ aggregateId: 'first-project', sourceMediaId: media.id, revision: 1 })
  );
  expect(puts.workspace).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ aggregateId: 'second-project', sourceMediaId: media.id, revision: 1 })
  );
  expect(puts.media).toHaveBeenCalledExactlyOnceWith({
    ...media,
    savedIndependently: false,
    lifecycle: { storageClass: 'library', savedAt: 10, updatedAt: 10 },
  });
  const edited = await commitImageWorkspace({
    aggregateId: 'first-project',
    document,
    expectedRevision: 1,
    expectedGeneration: first.sourceGeneration ?? null,
    requireExistingRoot: true,
  });
  expect(edited.revision).toBe(2);
  const preview = new Blob(['project-preview']);
  await commitImagePresentation({
    aggregateId: 'first-project',
    expectedWorkspaceRevision: 2,
    expectedGeneration: first.sourceGeneration ?? null,
    previewBlob: preview,
    thumbnailBlob: preview,
  });
  expect(puts.presentation).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      aggregateId: 'first-project',
      presentationRevision: 2,
    })
  );
  expect(puts.media).toHaveBeenCalledOnce();
});

it('refuses an image project after its observed original disappears', async () => {
  const puts = installTransaction({});
  await expect(
    commitImageWorkspace({
      aggregateId: 'new-project',
      original: { mediaId: 'deleted-original', generation: null },
      document: createEditorDocumentFixture(),
      expectedRevision: 0,
    })
  ).rejects.toMatchObject({ name: 'ImageAggregateNotFoundError' });
  expect(puts.workspace).not.toHaveBeenCalled();
  expect(puts.media).not.toHaveBeenCalled();
  expect(puts.presentation).not.toHaveBeenCalled();
});

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
