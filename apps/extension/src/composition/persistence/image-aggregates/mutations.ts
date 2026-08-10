import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type { EditorDocument } from '../../../features/editor/document/types';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { promoteLibraryLifecycle } from '../library-lifecycle/contracts';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import {
  ImageAggregateNotFoundError,
  ImageAggregateCollisionError,
  ImagePresentationNotCurrentError,
  StaleImageWorkspaceError,
} from './errors';
import { getMediaLibraryEntry } from '../media-library/index.library';
import { getImageWorkspace } from '../image-workspaces';
import { getAggregatePresentation } from '../aggregate-presentations';

export interface CommitImageWorkspaceInput {
  aggregateId: string;
  document: EditorDocument;
  expectedRevision: number;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
}

async function prepareNewImageAggregate(input: CommitImageWorkspaceInput) {
  const originalBlob = await dataUrlToBlob(input.document.sourceImageData);
  return {
    originalBlob,
    thumbnailBlob: await createImageThumbnailBlob(originalBlob),
  };
}

type ImageMutationDatabase = Parameters<Parameters<typeof runWithIndexedDbMutation>[0]>[0];
type PreparedNewImageAggregate = Awaited<ReturnType<typeof prepareNewImageAggregate>>;

function createNewImageAggregateRoot(
  input: CommitImageWorkspaceInput,
  prepared: PreparedNewImageAggregate,
  now: number
): MediaLibraryEntry {
  const filename = input.document.sourceName ?? 'Draft image';
  return {
    blob: prepared.originalBlob,
    createdAt: now,
    duration: null,
    filename,
    height: input.document.sourceHeight,
    id: input.aggregateId,
    kind: 'image',
    lifecycle: createLibraryLifecycle('temporary', now),
    mimeType: prepared.originalBlob.type || 'image/png',
    originalFilename: filename,
    size: prepared.originalBlob.size,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: input.sourceTitle ?? null,
    sourceUrl: sanitizeProvenanceUrl(input.sourceUrl),
    tags: [],
    updatedAt: now,
    width: input.document.sourceWidth,
    workspaceRevision: 0,
  };
}

async function persistImageAggregateRootIfMissing(args: {
  input: CommitImageWorkspaceInput;
  now: number;
  prepared: PreparedNewImageAggregate | null;
  putPresentation: (entry: {
    aggregateId: string;
    aggregateKind: 'image';
    presentationRevision: number;
    previewBlob: Blob;
    thumbnailBlob: Blob;
    updatedAt: number;
  }) => Promise<unknown>;
  putRoot: (entry: MediaLibraryEntry) => Promise<unknown>;
  readPresentation: () => Promise<unknown>;
  readRoot: () => Promise<unknown>;
  readWorkspace: () => Promise<unknown>;
}): Promise<MediaLibraryEntry> {
  const rawRoot = await args.readRoot();
  if (rawRoot !== undefined) {
    const existing = parseMediaLibraryEntry(rawRoot);
    if (!existing || !isEditableImageAggregateRoot(existing)) {
      throw new ImageAggregateCollisionError(args.input.aggregateId);
    }
    return existing;
  }
  if (!args.prepared || args.input.expectedRevision !== 0) {
    throw new ImageAggregateNotFoundError(args.input.aggregateId);
  }
  const [rawWorkspace, rawPresentation] = await Promise.all([
    args.readWorkspace(),
    args.readPresentation(),
  ]);
  if (rawWorkspace !== undefined || rawPresentation !== undefined) {
    throw new ImageAggregateCollisionError(args.input.aggregateId);
  }
  const created = createNewImageAggregateRoot(args.input, args.prepared, args.now);
  await args.putRoot(created);
  await args.putPresentation({
    aggregateId: args.input.aggregateId,
    aggregateKind: 'image',
    presentationRevision: 0,
    previewBlob: args.prepared.originalBlob,
    thumbnailBlob: args.prepared.thumbnailBlob,
    updatedAt: args.now,
  });
  return created;
}

function isEditableImageAggregateRoot(entry: MediaLibraryEntry): boolean {
  return (
    (entry.kind === 'image' || entry.kind === 'screenshot') &&
    entry.source.kind === 'screenshot' &&
    entry.blob instanceof Blob
  );
}

async function commitImageWorkspaceMutation(
  db: ImageMutationDatabase,
  input: CommitImageWorkspaceInput,
  prepared: PreparedNewImageAggregate | null
): Promise<{ revision: number; updatedAt: number }> {
  const tx = db.transaction(
    [MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE, AGGREGATE_PRESENTATIONS_STORE],
    'readwrite'
  );
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
  const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
  const now = Date.now();
  const media = await persistImageAggregateRootIfMissing({
    input,
    now,
    prepared,
    putPresentation: (entry) => presentationStore.put(entry),
    putRoot: (entry) => mediaStore.put(entry),
    readPresentation: () =>
      presentationStore.get(
        createAggregatePresentationKey({ id: input.aggregateId, kind: 'image' })
      ),
    readRoot: () => mediaStore.get(input.aggregateId),
    readWorkspace: () => workspaceStore.get(input.aggregateId),
  });
  if ((media.workspaceRevision ?? 0) !== input.expectedRevision) {
    throw new StaleImageWorkspaceError(input.aggregateId);
  }

  const rawWorkspace: unknown = await workspaceStore.get(input.aggregateId);
  const existing = parseImageWorkspaceEntry(rawWorkspace);
  if (rawWorkspace !== undefined && !existing) {
    throw new ImageAggregateCollisionError(input.aggregateId);
  }
  if (existing && existing.revision !== input.expectedRevision) {
    throw new StaleImageWorkspaceError(input.aggregateId);
  }
  const revision = input.expectedRevision + 1;
  await workspaceStore.put({
    aggregateId: input.aggregateId,
    createdAt: existing?.createdAt ?? now,
    document: input.document,
    revision,
    sourceTitle: input.sourceTitle ?? existing?.sourceTitle ?? media.sourceTitle,
    sourceUrl:
      input.sourceUrl === undefined
        ? (existing?.sourceUrl ?? media.sourceUrl)
        : sanitizeProvenanceUrl(input.sourceUrl),
    updatedAt: now,
  });
  await mediaStore.put({
    ...media,
    updatedAt: now,
    workspaceRevision: revision,
    lifecycle: media.lifecycle ? { ...media.lifecycle, updatedAt: now } : media.lifecycle,
  });
  await tx.done;
  return { revision, updatedAt: now };
}

export async function commitImageWorkspace(
  input: CommitImageWorkspaceInput
): Promise<{ revision: number; updatedAt: number }> {
  const prepared = input.expectedRevision === 0 ? await prepareNewImageAggregate(input) : null;
  return runWithIndexedDbMutation((db) => commitImageWorkspaceMutation(db, input, prepared));
}

export interface CommitImagePresentationInput {
  aggregateId: string;
  expectedWorkspaceRevision: number;
  previewBlob: Blob;
  thumbnailBlob: Blob;
}

export async function commitImagePresentation(input: CommitImagePresentationInput): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([MEDIA_LIBRARY_STORE, AGGREGATE_PRESENTATIONS_STORE], 'readwrite');
    const media = parseMediaLibraryEntry(
      await tx.objectStore(MEDIA_LIBRARY_STORE).get(input.aggregateId)
    );
    if (!media) throw new ImageAggregateNotFoundError(input.aggregateId);
    if ((media.workspaceRevision ?? 0) !== input.expectedWorkspaceRevision) {
      throw new StaleImageWorkspaceError(input.aggregateId);
    }
    await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).put({
      aggregateId: input.aggregateId,
      aggregateKind: 'image',
      presentationRevision: input.expectedWorkspaceRevision,
      previewBlob: input.previewBlob,
      thumbnailBlob: input.thumbnailBlob,
      updatedAt: Date.now(),
    });
    await tx.done;
  });
}

export async function promoteImageAggregate(
  aggregateId: string,
  expectedWorkspaceRevision: number
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([MEDIA_LIBRARY_STORE, AGGREGATE_PRESENTATIONS_STORE], 'readwrite');
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const media = parseMediaLibraryEntry(await mediaStore.get(aggregateId));
    if (!media) throw new ImageAggregateNotFoundError(aggregateId);
    if ((media.workspaceRevision ?? 0) !== expectedWorkspaceRevision) {
      throw new StaleImageWorkspaceError(aggregateId);
    }
    const presentation = parseAggregatePresentationEntry(
      await tx
        .objectStore(AGGREGATE_PRESENTATIONS_STORE)
        .get(createAggregatePresentationKey({ id: aggregateId, kind: 'image' }))
    );
    if (!presentation || presentation.presentationRevision !== expectedWorkspaceRevision) {
      throw new ImagePresentationNotCurrentError(aggregateId);
    }
    if (media.lifecycle?.storageClass === 'temporary') {
      await mediaStore.put({
        ...media,
        lifecycle: promoteLibraryLifecycle(media.lifecycle),
      });
    }
    await tx.done;
  });
}

function assertEditableImageRoot(
  aggregateId: string,
  media: ReturnType<typeof parseMediaLibraryEntry>
): MediaLibraryEntry & { blob: Blob } {
  if (
    !media ||
    media.source.kind !== 'screenshot' ||
    (media.kind !== 'image' && media.kind !== 'screenshot') ||
    !(media.blob instanceof Blob)
  ) {
    throw new ImageAggregateNotFoundError(aggregateId);
  }
  return media as MediaLibraryEntry & { blob: Blob };
}

async function createOriginalImageDocument(
  media: ReturnType<typeof assertEditableImageRoot>
): Promise<EditorDocument> {
  const width = media.width;
  const height = media.height;
  if (!width || !height) throw new ImageAggregateNotFoundError(media.id);
  return {
    version: 2,
    sourceImageData: await blobToDataUrl(media.blob),
    sourceName: media.originalFilename,
    sourceWidth: width,
    sourceHeight: height,
    canvasWidth: width,
    canvasHeight: height,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: width,
    sourceDisplayHeight: height,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#ffffff',
      backgroundGradientAngle: 0,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    canvasJson: JSON.stringify({ version: '7.2.0', objects: [] }),
  };
}

export async function restoreImageAggregateOriginal(
  aggregateId: string,
  expectedWorkspaceRevision: number
): Promise<{ revision: number; updatedAt: number }> {
  const source = assertEditableImageRoot(
    aggregateId,
    (await getMediaLibraryEntry(aggregateId)) ?? null
  );
  const [document, thumbnailBlob] = await Promise.all([
    createOriginalImageDocument(source),
    createImageThumbnailBlob(source.blob),
  ]);
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE, AGGREGATE_PRESENTATIONS_STORE],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
    const media = assertEditableImageRoot(
      aggregateId,
      parseMediaLibraryEntry(await mediaStore.get(aggregateId))
    );
    const workspace = parseImageWorkspaceEntry(await workspaceStore.get(aggregateId));
    if (
      (media.workspaceRevision ?? 0) !== expectedWorkspaceRevision ||
      (workspace && workspace.revision !== expectedWorkspaceRevision)
    ) {
      throw new StaleImageWorkspaceError(aggregateId);
    }
    const now = Date.now();
    const revision = expectedWorkspaceRevision + 1;
    await workspaceStore.put({
      aggregateId,
      createdAt: workspace?.createdAt ?? now,
      document,
      revision,
      sourceTitle: workspace?.sourceTitle ?? media.sourceTitle,
      sourceUrl: workspace?.sourceUrl ?? media.sourceUrl,
      updatedAt: now,
    });
    await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).put({
      aggregateId,
      aggregateKind: 'image',
      presentationRevision: revision,
      previewBlob: media.blob,
      thumbnailBlob,
      updatedAt: now,
    });
    await mediaStore.put({
      ...media,
      updatedAt: now,
      workspaceRevision: revision,
      lifecycle: media.lifecycle ? { ...media.lifecycle, updatedAt: now } : media.lifecycle,
    });
    await tx.done;
    return { revision, updatedAt: now };
  });
}

export async function copyImageAggregate(input: {
  aggregateId: string;
  expectedWorkspaceRevision: number;
  targetAggregateId: string;
}): Promise<string> {
  const [sourceMediaValue, sourceWorkspace, sourcePresentation] = await Promise.all([
    getMediaLibraryEntry(input.aggregateId),
    getImageWorkspace(input.aggregateId),
    getAggregatePresentation({ id: input.aggregateId, kind: 'image' }),
  ]);
  const sourceMedia = assertEditableImageRoot(input.aggregateId, sourceMediaValue ?? null);
  if (
    (sourceMedia.workspaceRevision ?? 0) !== input.expectedWorkspaceRevision ||
    (sourceWorkspace && sourceWorkspace.revision !== input.expectedWorkspaceRevision) ||
    !sourcePresentation ||
    sourcePresentation.presentationRevision !== input.expectedWorkspaceRevision
  ) {
    throw new ImagePresentationNotCurrentError(input.aggregateId);
  }
  const synthesizedDocument = sourceWorkspace
    ? null
    : await createOriginalImageDocument(sourceMedia);

  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE, AGGREGATE_PRESENTATIONS_STORE],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
    const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
    const currentMedia = assertEditableImageRoot(
      input.aggregateId,
      parseMediaLibraryEntry(await mediaStore.get(input.aggregateId))
    );
    const currentWorkspace = parseImageWorkspaceEntry(await workspaceStore.get(input.aggregateId));
    const currentPresentation = parseAggregatePresentationEntry(
      await presentationStore.get(
        createAggregatePresentationKey({ id: input.aggregateId, kind: 'image' })
      )
    );
    if (
      (currentMedia.workspaceRevision ?? 0) !== input.expectedWorkspaceRevision ||
      (currentWorkspace && currentWorkspace.revision !== input.expectedWorkspaceRevision)
    ) {
      throw new StaleImageWorkspaceError(input.aggregateId);
    }
    if (
      !currentPresentation ||
      currentPresentation.presentationRevision !== input.expectedWorkspaceRevision
    ) {
      throw new ImagePresentationNotCurrentError(input.aggregateId);
    }
    const targetMedia: unknown = await mediaStore.get(input.targetAggregateId);
    const targetWorkspace: unknown = await workspaceStore.get(input.targetAggregateId);
    const targetPresentation: unknown = await presentationStore.get(
      createAggregatePresentationKey({ id: input.targetAggregateId, kind: 'image' })
    );
    if (targetMedia || targetWorkspace || targetPresentation) {
      throw new ImageAggregateCollisionError(input.targetAggregateId);
    }
    const now = Date.now();
    const revision = currentWorkspace ? input.expectedWorkspaceRevision : 1;
    await mediaStore.put({
      ...currentMedia,
      id: input.targetAggregateId,
      createdAt: now,
      updatedAt: now,
      workspaceRevision: revision,
      lifecycle: createLibraryLifecycle('library', now),
    });
    await workspaceStore.put({
      ...(currentWorkspace ?? {
        createdAt: now,
        document: synthesizedDocument,
        revision,
        sourceTitle: currentMedia.sourceTitle,
        sourceUrl: currentMedia.sourceUrl,
      }),
      aggregateId: input.targetAggregateId,
      createdAt: now,
      revision,
      updatedAt: now,
    });
    await presentationStore.put({
      ...currentPresentation,
      aggregateId: input.targetAggregateId,
      presentationRevision: revision,
      updatedAt: now,
    });
    await tx.done;
    return input.targetAggregateId;
  });
}

export interface SaveImageAggregateCopyFromDocumentInput {
  document: EditorDocument;
  previewBlob: Blob;
  sourceFavicon?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  targetAggregateId: string;
  thumbnailBlob: Blob;
}

export async function saveImageAggregateCopyFromDocument(
  input: SaveImageAggregateCopyFromDocumentInput
): Promise<string> {
  const originalBlob = await dataUrlToBlob(input.document.sourceImageData);
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE, AGGREGATE_PRESENTATIONS_STORE],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
    const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
    const targetMedia: unknown = await mediaStore.get(input.targetAggregateId);
    const targetWorkspace: unknown = await workspaceStore.get(input.targetAggregateId);
    const targetPresentation: unknown = await presentationStore.get(
      createAggregatePresentationKey({ id: input.targetAggregateId, kind: 'image' })
    );
    if (targetMedia || targetWorkspace || targetPresentation) {
      throw new ImageAggregateCollisionError(input.targetAggregateId);
    }
    const now = Date.now();
    const filename = input.document.sourceName ?? 'Image copy';
    await mediaStore.put({
      blob: originalBlob,
      createdAt: now,
      duration: null,
      filename,
      height: input.document.sourceHeight,
      id: input.targetAggregateId,
      kind: 'image',
      lifecycle: createLibraryLifecycle('library', now),
      mimeType: originalBlob.type || 'image/png',
      originalFilename: filename,
      size: originalBlob.size,
      source: { kind: 'screenshot' },
      sourceFavicon: sanitizeProvenanceUrl(input.sourceFavicon),
      sourceTitle: input.sourceTitle ?? null,
      sourceUrl: sanitizeProvenanceUrl(input.sourceUrl),
      tags: [],
      updatedAt: now,
      width: input.document.sourceWidth,
      workspaceRevision: 1,
    });
    await workspaceStore.put({
      aggregateId: input.targetAggregateId,
      createdAt: now,
      document: input.document,
      revision: 1,
      sourceTitle: input.sourceTitle ?? null,
      sourceUrl: sanitizeProvenanceUrl(input.sourceUrl),
      updatedAt: now,
    });
    await presentationStore.put({
      aggregateId: input.targetAggregateId,
      aggregateKind: 'image',
      presentationRevision: 1,
      previewBlob: input.previewBlob,
      thumbnailBlob: input.thumbnailBlob,
      updatedAt: now,
    });
    await tx.done;
    return input.targetAggregateId;
  });
}
