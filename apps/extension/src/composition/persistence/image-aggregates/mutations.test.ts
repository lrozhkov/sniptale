import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';

const mocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,b3JpZ2luYWw='),
  createThumbnail: vi.fn(async () => new Blob(['original-thumbnail'])),
  getMedia: vi.fn(),
  getPresentation: vi.fn(),
  getWorkspace: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../media-library/index.library', () => ({
  getMediaLibraryEntry: mocks.getMedia,
}));

vi.mock('../image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-workspaces')>()),
  getImageWorkspace: mocks.getWorkspace,
}));

vi.mock('../aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../aggregate-presentations')>()),
  getAggregatePresentation: mocks.getPresentation,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.blobToDataUrl,
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: mocks.createThumbnail,
}));

import {
  commitImagePresentation,
  commitImageWorkspace,
  copyImageAggregate,
  promoteImageAggregate,
  restoreImageAggregateOriginal,
  saveImageAggregateCopyFromDocument,
} from './mutations';

function root(revision: number) {
  return {
    blob: new Blob(['immutable-original'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'image-1',
    kind: 'image' as const,
    lifecycle: createLibraryLifecycle('temporary', 2),
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 18,
    source: { kind: 'screenshot' as const },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: 100,
    workspaceRevision: revision,
  };
}

function installTransaction(args: {
  media?: object & { id: string };
  presentation?: object;
  sourceId?: string;
  targetAggregateId?: string;
  targetMedia?: object;
  targetPresentation?: object;
  targetWorkspace?: object;
  workspace?: object;
}) {
  const sourceId = args.media?.id ?? args.sourceId ?? 'image-1';
  const puts = {
    media: vi.fn(),
    presentation: vi.fn(),
    workspace: vi.fn(),
  };
  const stores = {
    aggregate_presentations: {
      get: vi.fn(async (key: [string, string]) => {
        if (key[1] === sourceId) return args.presentation;
        if (key[1] === args.targetAggregateId) return args.targetPresentation;
        return undefined;
      }),
      put: puts.presentation,
    },
    image_workspaces: {
      get: vi.fn(async (key: string) => {
        if (key === sourceId) return args.workspace;
        if (key === args.targetAggregateId) return args.targetWorkspace;
        return undefined;
      }),
      put: puts.workspace,
    },
    media_library: {
      get: vi.fn(async (key: string) => {
        if (key === sourceId) return args.media;
        if (key === args.targetAggregateId) return args.targetMedia;
        return undefined;
      }),
      put: puts.media,
    },
  } as const;
  mocks.runMutation.mockImplementationOnce(async (effect) =>
    effect({
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        objectStore: vi.fn((name: keyof typeof stores) => stores[name]),
      })),
    })
  );
  return puts;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(10);
});

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
  ).resolves.toEqual({ revision: 3, updatedAt: 10 });
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: media.id, document, revision: 3 })
  );
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({ blob: media.blob, workspaceRevision: 3 })
  );
});

it('creates a missing revision-zero aggregate and rejects non-initial missing roots', async () => {
  const document = createEditorDocumentFixture();
  const puts = installTransaction({ sourceId: 'new-image' });

  await expect(
    commitImageWorkspace({ aggregateId: 'new-image', document, expectedRevision: 0 })
  ).resolves.toEqual({ revision: 1, updatedAt: 10 });
  expect(puts.media).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'new-image', workspaceRevision: 0 })
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

it('rejects occupied aggregate IDs before creating or attaching image authority', async () => {
  const document = createEditorDocumentFixture();
  const recordingRoot = {
    ...root(0),
    id: 'occupied-recording',
    kind: 'recording' as const,
    source: { kind: 'recording' as const, recordingId: 'recording-1' },
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
});

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
    expect.objectContaining({ id: media.id, workspaceRevision: 3, blob: media.blob })
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
      blob: media.blob,
      id: 'image-copy',
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
      workspaceRevision: 2,
    })
  );
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'image-copy', revision: 2 })
  );
  expect(puts.presentation).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'image-copy', presentationRevision: 2 })
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
      lifecycle: expect.objectContaining({ storageClass: 'library' }),
      sourceUrl: 'https://example.test/private',
      workspaceRevision: 1,
    })
  );
  expect(puts.workspace).toHaveBeenCalledWith(
    expect.objectContaining({ aggregateId: 'stale-tab-copy', document, revision: 1 })
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
