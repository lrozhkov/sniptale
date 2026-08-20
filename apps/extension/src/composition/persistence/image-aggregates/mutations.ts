import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import type { EditorDocument } from '../../../features/editor/document/types';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  initDB,
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
import { readImageWorkspace } from '../image-workspaces/read';
import { getAggregatePresentation } from '../aggregate-presentations';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  createAssetPublicationJournal,
  deleteAssetObject,
  discardPreparedAsset,
  publishReadyJournalWithRetry,
  parseAssetRef,
  readAssetFile,
  recoverStandaloneAssetPublications,
  releaseAssetReadyProtection,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
} from '../assets';
import {
  parsePersistedEditorDocument,
  preparePersistedEditorDocument,
  replaceEditorDocumentAssetOwnership,
  type PersistedEditorDocumentV3,
} from '../document-assets';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

const IMAGE_WORKSPACE_PUBLICATION_DOMAIN = 'image-workspace';
const IMAGE_WORKSPACE_OWNER_KIND = 'image-workspace';

interface PreparedImageWorkspaceInput extends Omit<CommitImageWorkspaceInput, 'document'> {
  document: PersistedEditorDocumentV3;
  refs: AssetRef[];
}

export interface CommitImageWorkspaceInput {
  aggregateId: string;
  document: EditorDocument;
  expectedRevision: number;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceFavicon?: string | null;
  sourceGuard?: {
    aggregateId: string;
    presentationRevision: number;
    workspaceRevision: number;
  };
  requireMissingRoot?: boolean;
}

type ImageMutationDatabase = Parameters<Parameters<typeof runWithIndexedDbMutation>[0]>[0];
type PreparedNewImageAggregate = { originalBlob: Blob; thumbnailBlob: Blob };

function createNewImageAggregateRoot(
  input: PreparedImageWorkspaceInput,
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
    sourceFavicon: sanitizeProvenanceUrl(input.sourceFavicon),
    sourceTitle: input.sourceTitle ?? null,
    sourceUrl: sanitizeProvenanceUrl(input.sourceUrl),
    tags: [],
    updatedAt: now,
    width: input.document.sourceWidth,
    workspaceRevision: 0,
  };
}

async function persistImageAggregateRootIfMissing(args: {
  input: PreparedImageWorkspaceInput;
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
    if (args.input.requireMissingRoot) {
      throw new ImageAggregateCollisionError(args.input.aggregateId);
    }
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
  input: PreparedImageWorkspaceInput,
  prepared: PreparedNewImageAggregate | null
): Promise<{ revision: number; updatedAt: number }> {
  const tx = db.transaction(
    [
      MEDIA_LIBRARY_STORE,
      IMAGE_WORKSPACES_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE,
    ],
    'readwrite'
  );
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
  const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
  const now = Date.now();
  if (input.sourceGuard) {
    const guardedMedia = parseMediaLibraryEntry(
      await mediaStore.get(input.sourceGuard.aggregateId)
    );
    const guardedWorkspace = parseImageWorkspaceEntry(
      await workspaceStore.get(input.sourceGuard.aggregateId)
    );
    const guardedPresentation = parseAggregatePresentationEntry(
      await presentationStore.get(
        createAggregatePresentationKey({ id: input.sourceGuard.aggregateId, kind: 'image' })
      )
    );
    if (
      !guardedMedia ||
      (guardedMedia.workspaceRevision ?? 0) !== input.sourceGuard.workspaceRevision ||
      (guardedWorkspace?.revision ?? 0) !== input.sourceGuard.workspaceRevision
    ) {
      throw new StaleImageWorkspaceError(input.sourceGuard.aggregateId);
    }
    if (guardedPresentation?.presentationRevision !== input.sourceGuard.presentationRevision) {
      throw new ImagePresentationNotCurrentError(input.sourceGuard.aggregateId);
    }
  }
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
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await replaceEditorDocumentAssetOwnership({
    nextDocument: input.document,
    nextRefs: input.refs,
    ownerId: input.aggregateId,
    ownerKind: IMAGE_WORKSPACE_OWNER_KIND,
    previousDocument: existing?.document ?? null,
    physicalDelete,
    stores: {
      owners: tx.objectStore(ASSET_OWNERS_STORE),
      refs: tx.objectStore(ASSET_REFS_STORE),
    },
  });
  if (physicalDelete.assetIds.length > 0) {
    await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
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
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
  return { revision, updatedAt: now };
}

export async function commitImageWorkspace(
  input: CommitImageWorkspaceInput
): Promise<{ revision: number; updatedAt: number }> {
  const preparedDocument = await preparePersistedEditorDocument(input.document);
  const preparedInput: PreparedImageWorkspaceInput = {
    ...input,
    document: preparedDocument.document,
    refs: preparedDocument.objects.map(({ ref }) => ref),
  };
  let journalCreated = false;
  try {
    await recoverImageWorkspacePublications();
    const journal = await createAssetPublicationJournal({
      assetRefs: preparedInput.refs,
      domain: IMAGE_WORKSPACE_PUBLICATION_DOMAIN,
      payload: preparedInput,
    });
    journalCreated = true;
    let result: { revision: number; updatedAt: number } | undefined;
    await publishReadyJournalWithRetry(journal, async (ready) => {
      const published = await publishImageWorkspaceJournal(ready);
      if (!published) throw new Error('Image workspace publication was superseded.');
      result = published;
    });
    await releaseAssetReadyProtection(preparedInput.refs.map((ref) => ref.assetId));
    if (!result) throw new Error('Image workspace publication produced no result.');
    return result;
  } catch (error) {
    if (!journalCreated) {
      const cleanup = await Promise.allSettled(
        preparedInput.refs.map((ref) => discardPreparedAsset(ref.assetId))
      );
      const failures = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : []
      );
      if (failures.length > 0) {
        throw new AggregateError([error, ...failures], 'Image workspace save cleanup failed.', {
          cause: error,
        });
      }
    }
    throw error;
  }
}

function parseImageWorkspacePublicationPayload(value: unknown): PreparedImageWorkspaceInput | null {
  if (!isRecord(value)) return null;
  const document = parsePersistedEditorDocument(value['document']);
  if (
    !document ||
    !isString(value['aggregateId']) ||
    !isNumber(value['expectedRevision']) ||
    !Number.isInteger(value['expectedRevision']) ||
    !Array.isArray(value['refs'])
  ) {
    return null;
  }
  for (const key of ['sourceFavicon', 'sourceTitle', 'sourceUrl'] as const) {
    const field = value[key];
    if (field !== undefined && field !== null && !isString(field)) return null;
  }
  if (
    value['requireMissingRoot'] !== undefined &&
    typeof value['requireMissingRoot'] !== 'boolean'
  ) {
    return null;
  }
  const refs = value['refs'].map(parseAssetRef);
  if (refs.some((ref) => ref === null)) return null;
  const rawSourceGuard = value['sourceGuard'];
  const sourceGuard = isRecord(rawSourceGuard)
    ? {
        aggregateId: rawSourceGuard['aggregateId'],
        presentationRevision: rawSourceGuard['presentationRevision'],
        workspaceRevision: rawSourceGuard['workspaceRevision'],
      }
    : null;
  if (
    rawSourceGuard !== undefined &&
    (!sourceGuard ||
      !isString(sourceGuard.aggregateId) ||
      !Number.isInteger(sourceGuard.presentationRevision) ||
      !Number.isInteger(sourceGuard.workspaceRevision))
  ) {
    return null;
  }
  return {
    aggregateId: value['aggregateId'],
    document,
    expectedRevision: value['expectedRevision'],
    refs: refs as AssetRef[],
    ...(sourceGuard
      ? {
          sourceGuard: sourceGuard as NonNullable<CommitImageWorkspaceInput['sourceGuard']>,
        }
      : {}),
    ...(value['sourceTitle'] === undefined
      ? {}
      : { sourceTitle: value['sourceTitle'] as string | null }),
    ...(value['sourceUrl'] === undefined ? {} : { sourceUrl: value['sourceUrl'] as string | null }),
    ...(value['sourceFavicon'] === undefined
      ? {}
      : { sourceFavicon: value['sourceFavicon'] as string | null }),
    ...(value['requireMissingRoot'] === undefined
      ? {}
      : { requireMissingRoot: value['requireMissingRoot'] }),
  };
}

async function publishImageWorkspaceJournal(
  journal: AssetReadyJournal,
  allowSuperseded = false
): Promise<{ revision: number; updatedAt: number } | null> {
  if (journal.domain !== IMAGE_WORKSPACE_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid image workspace publication journal.');
  }
  const input = parseImageWorkspacePublicationPayload(journal.payload);
  if (!input || input.refs.length !== journal.assetRefs.length) {
    throw new Error('Invalid image workspace publication payload.');
  }
  const db = await initDB();
  const existing = parseImageWorkspaceEntry(
    await db.get(IMAGE_WORKSPACES_STORE, input.aggregateId)
  );
  if (
    existing?.revision === input.expectedRevision + 1 &&
    JSON.stringify(existing.document) === JSON.stringify(input.document)
  ) {
    return { revision: existing.revision, updatedAt: existing.updatedAt };
  }
  const existingMedia = parseMediaLibraryEntry(
    await db.get(MEDIA_LIBRARY_STORE, input.aggregateId)
  );
  const permanentlySuperseded = input.requireMissingRoot
    ? existingMedia !== null
    : (existingMedia?.workspaceRevision ?? 0) !== input.expectedRevision;
  if (allowSuperseded && permanentlySuperseded) {
    for (const asset of input.document.assets) {
      const ref: unknown = await db.get(ASSET_REFS_STORE, asset.assetId);
      const owner: unknown = await db.get(ASSET_OWNERS_STORE, [
        IMAGE_WORKSPACE_OWNER_KIND,
        input.aggregateId,
        asset.role,
      ]);
      if (ref !== undefined || owner !== undefined) {
        throw new StaleImageWorkspaceError(input.aggregateId);
      }
    }
    await Promise.all(input.document.assets.map((asset) => deleteAssetObject(asset.assetId)));
    return null;
  }
  const sourceRef = input.refs.find((ref) => ref.assetId === input.document.sourceImage.assetId);
  if (!sourceRef) throw new Error('Image workspace source ref is missing.');
  const prepared =
    input.expectedRevision === 0
      ? await (async () => {
          const originalBlob = await readAssetFile(sourceRef, input.document.sourceName ?? 'image');
          return { originalBlob, thumbnailBlob: await createImageThumbnailBlob(originalBlob) };
        })()
      : null;
  return runWithIndexedDbMutation((mutationDb) =>
    commitImageWorkspaceMutation(mutationDb, input, prepared)
  );
}

export const imageWorkspacePublicationAdapter: AssetPublicationAdapter = {
  domain: IMAGE_WORKSPACE_PUBLICATION_DOMAIN,
  publish: async (journal) => {
    await publishImageWorkspaceJournal(journal, true);
  },
};

export function recoverImageWorkspacePublications(): Promise<number> {
  return recoverStandaloneAssetPublications([imageWorkspacePublicationAdapter]);
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
      backgroundBlurAmount: 0,
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
  const result = await commitImageWorkspace({
    aggregateId,
    document,
    expectedRevision: expectedWorkspaceRevision,
    sourceFavicon: source.sourceFavicon,
    sourceTitle: source.sourceTitle,
    sourceUrl: source.sourceUrl,
  });
  await commitImagePresentation({
    aggregateId,
    expectedWorkspaceRevision: result.revision,
    previewBlob: source.blob,
    thumbnailBlob,
  });
  return result;
}

export async function copyImageAggregate(input: {
  aggregateId: string;
  expectedWorkspaceRevision: number;
  targetAggregateId: string;
}): Promise<string> {
  await recoverImageWorkspacePublications();
  const [sourceMediaValue, sourceWorkspace, sourcePresentation] = await Promise.all([
    getMediaLibraryEntry(input.aggregateId),
    readImageWorkspace(input.aggregateId),
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
  const document = sourceWorkspace?.document ?? (await createOriginalImageDocument(sourceMedia));
  try {
    return await saveImageAggregateCopyFromDocument({
      document,
      previewBlob: sourcePresentation.previewBlob ?? sourceMedia.blob,
      sourceFavicon: sourceMedia.sourceFavicon,
      sourceTitle: sourceWorkspace?.sourceTitle ?? sourceMedia.sourceTitle,
      sourceUrl: sourceWorkspace?.sourceUrl ?? sourceMedia.sourceUrl,
      targetAggregateId: input.targetAggregateId,
      thumbnailBlob: sourcePresentation.thumbnailBlob,
      sourceGuard: {
        aggregateId: input.aggregateId,
        presentationRevision: input.expectedWorkspaceRevision,
        workspaceRevision: input.expectedWorkspaceRevision,
      },
    });
  } finally {
    sourceWorkspace?.releaseDocumentAssets?.();
  }
}

export interface SaveImageAggregateCopyFromDocumentInput {
  document: EditorDocument;
  previewBlob: Blob;
  sourceFavicon?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  targetAggregateId: string;
  thumbnailBlob: Blob;
  sourceGuard?: CommitImageWorkspaceInput['sourceGuard'];
}

export async function saveImageAggregateCopyFromDocument(
  input: SaveImageAggregateCopyFromDocumentInput
): Promise<string> {
  const result = await commitImageWorkspace({
    aggregateId: input.targetAggregateId,
    document: input.document,
    expectedRevision: 0,
    requireMissingRoot: true,
    ...(input.sourceFavicon === undefined ? {} : { sourceFavicon: input.sourceFavicon }),
    ...(input.sourceTitle === undefined ? {} : { sourceTitle: input.sourceTitle }),
    ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl }),
    ...(input.sourceGuard ? { sourceGuard: input.sourceGuard } : {}),
  });
  await commitImagePresentation({
    aggregateId: input.targetAggregateId,
    expectedWorkspaceRevision: result.revision,
    previewBlob: input.previewBlob,
    thumbnailBlob: input.thumbnailBlob,
  });
  await promoteImageAggregate(input.targetAggregateId, result.revision);
  return input.targetAggregateId;
}
