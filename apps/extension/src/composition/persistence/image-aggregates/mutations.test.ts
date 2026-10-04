import { getImageMutationMocks, root, installTransaction } from './mutations.test-support';
import { expect, it } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import {
  commitImagePresentation,
  commitImageWorkspace,
  copyImageAggregate,
  promoteImageAggregate,
  restoreImageAggregateOriginal,
  saveImageAggregateCopyFromDocument,
} from './mutations';

const mocks = getImageMutationMocks();

it('commits a workspace with integer CAS while preserving the immutable original', async () => {
  const media = root(2);
  const workspace = {
    aggregateId: media.id,
    createdAt: 2,
    document: createEditorDocumentFixture(),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 2,
  };
  const puts = installTransaction({ media, workspace });
  const document = { ...createEditorDocumentFixture(), canvasJson: '{"objects":[{"x":1}]}' };

  await expect(
    commitImageWorkspace({ aggregateId: media.id, document, expectedRevision: 2 })
  ).resolves.toMatchObject({
    documentAssetsByRuntimeUrl: expect.any(Map),
    revision: 3,
    updatedAt: 10,
  });
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: media.id,
      document: expect.objectContaining({ version: 3 }),
      revision: 3,
    })
  );
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({
      blob: media.blob,
      imageContentState: 'edited',
      workspaceRevision: 3,
    })
  );
});

it('saves scenario Library image edits without replacing the stored source', async () => {
  const media = {
    ...root(0),
    id: 'scenario-asset:material',
    blob: undefined,
    source: { kind: 'stored-asset' as const, assetId: 'immutable-scenario-source' },
  };
  const puts = installTransaction({ media });
  const document = createEditorDocumentFixture();
  await expect(
    commitImageWorkspace({ aggregateId: media.id, document, expectedRevision: 0 })
  ).resolves.toMatchObject({ revision: 1 });
  await expect(
    commitImageWorkspace({
      aggregateId: media.id,
      document: { ...document, canvasJson: '{"objects":[{"x":1}]}' },
      expectedRevision: 1,
    })
  ).resolves.toMatchObject({ revision: 2 });
  expect(puts.media).toHaveBeenLastCalledWith({
    ...media,
    imageContentState: 'edited',
    updatedAt: 10,
    workspaceRevision: 2,
    lifecycle: { ...media.lifecycle, updatedAt: 10 },
  });
  await expect(
    commitImageWorkspace({ aggregateId: media.id, document, expectedRevision: 1 })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(puts.media).toHaveBeenCalledTimes(2);
});

it('creates a missing revision-zero aggregate and rejects non-initial missing roots', async () => {
  const document = createEditorDocumentFixture();
  const puts = installTransaction({ sourceId: 'new-image' });
  const input = { aggregateId: 'new-image', document, expectedRevision: 0, captureTime: 3 };

  await expect(commitImageWorkspace(input)).resolves.toMatchObject({
    documentAssetsByRuntimeUrl: expect.any(Map),
    revision: 1,
    updatedAt: 10,
  });
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'new-image', createdAt: 3, workspaceRevision: 0 })
  );
  expect(puts.presentation).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'new-image', presentationRevision: 0 })
  );

  installTransaction({ sourceId: 'missing-image' });
  await expect(
    commitImageWorkspace({
      aggregateId: 'missing-image',
      document,
      expectedRevision: 1,
    })
  ).rejects.toMatchObject({ aggregateId: 'missing-image', name: 'ImageAggregateNotFoundError' });
});

it.each(['recording', 'stored-asset'] as const)(
  'rejects occupied non-image aggregate IDs with %s source',
  async (sourceKind) => {
    const document = createEditorDocumentFixture();
    const recordingRoot = {
      ...root(0),
      id: 'occupied-recording',
      kind: 'recording' as const,
      source:
        sourceKind === 'recording'
          ? { kind: sourceKind, recordingId: 'recording-1' }
          : { kind: sourceKind, assetId: 'scenario-audio' },
    };
    const recordingPuts = installTransaction({ media: recordingRoot });
    await expect(
      commitImageWorkspace({
        aggregateId: recordingRoot.id,
        document,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
    expect(recordingPuts.media).not.toHaveBeenCalled();
    expect(recordingPuts.workspace).not.toHaveBeenCalled();

    const malformedPuts = installTransaction({
      media: { id: 'malformed-root' },
    });
    await expect(
      commitImageWorkspace({
        aggregateId: 'malformed-root',
        document,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
    expect(malformedPuts.media).not.toHaveBeenCalled();

    const workspacePuts = installTransaction({
      sourceId: 'workspace-only',
      workspace: { aggregateId: 'workspace-only' },
    });
    await expect(
      commitImageWorkspace({
        aggregateId: 'workspace-only',
        document,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
    expect(workspacePuts.media).not.toHaveBeenCalled();

    const presentationPuts = installTransaction({
      presentation: { aggregateId: 'presentation-only' },
      sourceId: 'presentation-only',
    });
    await expect(
      commitImageWorkspace({
        aggregateId: 'presentation-only',
        document,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
    expect(presentationPuts.media).not.toHaveBeenCalled();
  }
);

it('rejects a malformed occupied workspace instead of overwriting it', async () => {
  const media = root(0);
  const puts = installTransaction({
    media,
    workspace: { aggregateId: media.id, revision: 'invalid' },
  });

  await expect(
    commitImageWorkspace({
      aggregateId: media.id,
      document: createEditorDocumentFixture(),
      expectedRevision: 0,
    })
  ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
  expect(puts.workspace).not.toHaveBeenCalled();
  expect(puts.media).not.toHaveBeenCalled();
});

it('rejects stale workspace and presentation writes before mutation', async () => {
  const media = root(3);
  const puts = installTransaction({ media });
  await expect(
    commitImageWorkspace({
      aggregateId: media.id,
      document: createEditorDocumentFixture(),
      expectedRevision: 2,
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(puts.media).not.toHaveBeenCalled();

  const presentationPuts = installTransaction({ media });
  await expect(
    commitImagePresentation({
      aggregateId: media.id,
      expectedWorkspaceRevision: 2,
      previewBlob: new Blob(['preview']),
      thumbnailBlob: new Blob(['thumbnail']),
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(presentationPuts.presentation).not.toHaveBeenCalled();

  const workspacePuts = installTransaction({
    media: root(2),
    workspace: {
      aggregateId: 'image-1',
      createdAt: 1,
      document: createEditorDocumentFixture(),
      revision: 3,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 2,
    },
  });
  await expect(
    commitImageWorkspace({
      aggregateId: 'image-1',
      document: createEditorDocumentFixture(),
      expectedRevision: 2,
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(workspacePuts.workspace).not.toHaveBeenCalled();

  installTransaction({ sourceId: 'missing-image' });
  await expect(
    commitImagePresentation({
      aggregateId: 'missing-image',
      expectedWorkspaceRevision: 0,
      previewBlob: new Blob(['preview']),
      thumbnailBlob: new Blob(['thumbnail']),
    })
  ).rejects.toMatchObject({ name: 'ImageAggregateNotFoundError' });
});

it('promotes only a presentation matching the current workspace revision', async () => {
  const media = root(4);
  const current = {
    aggregateId: media.id,
    aggregateKind: 'image',
    presentationRevision: 4,
    thumbnailBlob: new Blob(['thumbnail']),
    updatedAt: 5,
  };
  const puts = installTransaction({ media, presentation: current });
  await promoteImageAggregate(media.id, 4);
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({ lifecycle: expect.objectContaining({ storageClass: 'library' }) })
  );

  installTransaction({ media, presentation: { ...current, presentationRevision: 3 } });
  await expect(promoteImageAggregate(media.id, 4)).rejects.toMatchObject({
    name: 'ImagePresentationNotCurrentError',
  });

  const libraryMedia = {
    ...media,
    lifecycle: createLibraryLifecycle('library', 2),
  };
  const libraryPuts = installTransaction({ media: libraryMedia, presentation: current });
  await promoteImageAggregate(libraryMedia.id, 4);
  expect(libraryPuts.media).not.toHaveBeenCalled();

  installTransaction({ media: root(5), presentation: current });
  await expect(promoteImageAggregate(media.id, 4)).rejects.toMatchObject({
    name: 'StaleImageWorkspaceError',
  });
});

it('restores the immutable original as a new current workspace revision', async () => {
  const media = root(2);
  const workspace = {
    aggregateId: media.id,
    createdAt: 2,
    document: createEditorDocumentFixture(),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 2,
  };
  mocks.getMedia.mockResolvedValue(media);
  const puts = installTransaction({ media, workspace });

  await expect(restoreImageAggregateOriginal(media.id, 2)).resolves.toEqual({
    revision: 3,
    updatedAt: 10,
  });
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: media.id, revision: 3 })
  );
  expect(puts.presentation).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: media.id,
      presentationRevision: 3,
      previewBlob: media.blob,
    })
  );
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({
      blob: media.blob,
      id: media.id,
      imageContentState: 'original',
      workspaceRevision: 3,
    })
  );
});

it('rejects invalid and stale roots while restoring the original', async () => {
  const invalid = { ...root(2), width: null };
  mocks.getMedia.mockResolvedValue(invalid);
  await expect(restoreImageAggregateOriginal(invalid.id, 2)).rejects.toMatchObject({
    name: 'ImageAggregateNotFoundError',
  });

  const media = root(2);
  mocks.getMedia.mockResolvedValue(media);
  installTransaction({
    media,
    workspace: {
      aggregateId: media.id,
      createdAt: 1,
      document: createEditorDocumentFixture(),
      revision: 3,
      sourceTitle: null,
      sourceUrl: null,
      updatedAt: 2,
    },
  });
  await expect(restoreImageAggregateOriginal(media.id, 2)).rejects.toMatchObject({
    name: 'StaleImageWorkspaceError',
  });
});

it('saves a complete library copy under a new aggregate id', async () => {
  const media = root(2);
  const workspace = {
    aggregateId: media.id,
    createdAt: 2,
    document: createEditorDocumentFixture(),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 2,
  };
  const presentation = {
    aggregateId: media.id,
    aggregateKind: 'image' as const,
    presentationRevision: 2,
    previewBlob: new Blob(['current-preview']),
    thumbnailBlob: new Blob(['current-thumbnail']),
    updatedAt: 2,
  };
  mocks.getMedia.mockResolvedValue(media);
  mocks.getWorkspace.mockResolvedValue(workspace);
  mocks.getPresentation.mockResolvedValue(presentation);
  const puts = installTransaction({ media, presentation, workspace });

  await expect(
    copyImageAggregate({
      aggregateId: media.id,
      expectedWorkspaceRevision: 2,
      targetAggregateId: 'image-copy',
    })
  ).resolves.toBe('image-copy');
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({
      blob: expect.any(Blob),
      id: 'image-copy',
      imageContentState: 'edited',
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
      workspaceRevision: 1,
    })
  );
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'image-copy', revision: 1 })
  );
  expect(puts.presentation).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'image-copy', presentationRevision: 1 })
  );
});

it('copies an original-only aggregate by synthesizing its first workspace', async () => {
  const media = root(0);
  const presentation = {
    aggregateId: media.id,
    aggregateKind: 'image' as const,
    presentationRevision: 0,
    thumbnailBlob: new Blob(['current-thumbnail']),
    updatedAt: 2,
  };
  mocks.getMedia.mockResolvedValue(media);
  mocks.getWorkspace.mockResolvedValue(undefined);
  mocks.getPresentation.mockResolvedValue(presentation);
  const puts = installTransaction({
    media,
    presentation,
    targetAggregateId: 'image-copy',
  });

  await expect(
    copyImageAggregate({
      aggregateId: media.id,
      expectedWorkspaceRevision: 0,
      targetAggregateId: 'image-copy',
    })
  ).resolves.toBe('image-copy');
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: 'image-copy',
      document: expect.any(Object),
      revision: 1,
    })
  );
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'image-copy', imageContentState: 'original' })
  );
});

it('rejects non-current and colliding aggregate copies before writing', async () => {
  const media = root(2);
  mocks.getMedia.mockResolvedValue(media);
  mocks.getWorkspace.mockResolvedValue(undefined);
  mocks.getPresentation.mockResolvedValue(undefined);
  await expect(
    copyImageAggregate({
      aggregateId: media.id,
      expectedWorkspaceRevision: 2,
      targetAggregateId: 'image-copy',
    })
  ).rejects.toMatchObject({ name: 'ImagePresentationNotCurrentError' });

  const workspace = {
    aggregateId: media.id,
    createdAt: 2,
    document: createEditorDocumentFixture(),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 2,
  };
  const presentation = {
    aggregateId: media.id,
    aggregateKind: 'image' as const,
    presentationRevision: 2,
    thumbnailBlob: new Blob(['thumbnail']),
    updatedAt: 2,
  };
  mocks.getWorkspace.mockResolvedValue(workspace);
  mocks.getPresentation.mockResolvedValue(presentation);
  const puts = installTransaction({
    media,
    presentation,
    targetAggregateId: 'image-copy',
    targetWorkspace: { aggregateId: 'image-copy' },
    workspace,
  });
  await expect(
    copyImageAggregate({
      aggregateId: media.id,
      expectedWorkspaceRevision: 2,
      targetAggregateId: 'image-copy',
    })
  ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
  expect(puts.media).not.toHaveBeenCalled();
});

it('rejects copy races after preflight without partially creating the target', async () => {
  const media = root(2);
  const workspace = {
    aggregateId: media.id,
    createdAt: 2,
    document: createEditorDocumentFixture(),
    revision: 2,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt: 2,
  };
  const presentation = {
    aggregateId: media.id,
    aggregateKind: 'image' as const,
    presentationRevision: 2,
    thumbnailBlob: new Blob(['thumbnail']),
    updatedAt: 2,
  };
  mocks.getMedia.mockResolvedValue(media);
  mocks.getWorkspace.mockResolvedValue(workspace);
  mocks.getPresentation.mockResolvedValue(presentation);

  const stalePuts = installTransaction({
    media: root(3),
    presentation,
    targetAggregateId: 'image-copy',
    workspace: { ...workspace, revision: 3 },
  });
  await expect(
    copyImageAggregate({
      aggregateId: media.id,
      expectedWorkspaceRevision: 2,
      targetAggregateId: 'image-copy',
    })
  ).rejects.toMatchObject({ name: 'StaleImageWorkspaceError' });
  expect(stalePuts.media).not.toHaveBeenCalled();

  const presentationPuts = installTransaction({
    media,
    presentation: { ...presentation, presentationRevision: 1 },
    targetAggregateId: 'image-copy',
    workspace,
  });
  await expect(
    copyImageAggregate({
      aggregateId: media.id,
      expectedWorkspaceRevision: 2,
      targetAggregateId: 'image-copy',
    })
  ).rejects.toMatchObject({ name: 'ImagePresentationNotCurrentError' });
  expect(presentationPuts.media).not.toHaveBeenCalled();
});

it('atomically saves unsaved editor state as a revision-one library copy', async () => {
  const media = root(2);
  const puts = installTransaction({ media });
  const document = {
    ...createEditorDocumentFixture(),
    canvasJson: '{"objects":[{"type":"annotation"}]}',
  };
  const previewBlob = new Blob(['unsaved-preview'], { type: 'image/png' });
  const thumbnailBlob = new Blob(['unsaved-thumbnail'], { type: 'image/png' });

  await expect(
    saveImageAggregateCopyFromDocument({
      document,
      previewBlob,
      sourceTitle: 'Unsaved tab',
      sourceUrl: 'https://example.test/private?token=secret',
      targetAggregateId: 'stale-tab-copy',
      thumbnailBlob,
    })
  ).resolves.toBe('stale-tab-copy');
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'stale-tab-copy',
      imageContentState: 'edited',
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
      sourceUrl: 'https://example.test/private',
      workspaceRevision: 1,
    })
  );
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: 'stale-tab-copy',
      document: expect.objectContaining({ version: 3 }),
      revision: 1,
    })
  );
  expect(puts.presentation).toHaveBeenCalledWith(
    expect.objectContaining({
      aggregateId: 'stale-tab-copy',
      presentationRevision: 1,
      previewBlob,
      thumbnailBlob,
    })
  );
});

it('rejects stale-editor copy id collisions before writing any aggregate owner', async () => {
  const target = { ...root(0), id: 'stale-tab-copy' };
  const puts = installTransaction({ media: target });

  await expect(
    saveImageAggregateCopyFromDocument({
      document: createEditorDocumentFixture(),
      previewBlob: new Blob(['preview']),
      targetAggregateId: target.id,
      thumbnailBlob: new Blob(['thumbnail']),
    })
  ).rejects.toMatchObject({ name: 'ImageAggregateCollisionError' });
  expect(puts.media).not.toHaveBeenCalled();
  expect(puts.workspace).not.toHaveBeenCalled();
  expect(puts.presentation).not.toHaveBeenCalled();
});
