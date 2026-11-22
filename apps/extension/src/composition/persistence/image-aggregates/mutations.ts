import { legacyImageProjectId } from '../media-library/legacy-projects';
import { sameLibrarySourceRef } from '../projects/library-source-ref';
import type {
  CommitImageWorkspaceInput,
  CommitImageWorkspaceResult,
  NewImageOriginal,
  CommitImagePresentationInput,
  SaveImageAggregateCopyFromDocumentInput,
  ImageWorkspacePublicationResult,
  ImageAggregateCopyResult,
} from './contracts';
import { isImageCaptureSource } from '../sync-capture/image-snapshot';
import type { IDBPTransaction } from 'idb';
import { commitImagePresentationCacheInTransaction } from '../sync-capture/presentation';
import { ASSET_RESIDENCY_STORE } from '../infrastructure/indexed-db/core.stores';
import { captureCheckpointReceiptInTransaction } from '../sync-capture/checkpoints';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  captureImageInTransaction,
  captureMediaInTransaction,
  captureDeletionInTransaction,
  readImageRevisionFence,
} from '../sync-capture/capture';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  PROJECT_ASSETS_STORE,
  MEDIA_LIBRARY_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { parseProjectAssetEntry } from '../projects/read-guards';
import type { StoredProjectAssetEntry } from '../projects/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { ImageContentState, MediaLibraryEntry } from '../media-library/contracts';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { imageWorkspaceAssetBindings } from '../image-workspaces/assets';
import {
  readImageWorkspaceIdentity,
  createImageWorkspaceIdentity,
  retireImageWorkspaceIdentity,
} from '../image-workspaces/identity';
import {
  parsePersistedImageHistory,
  type PersistedImageHistory,
} from '../image-workspaces/history-contracts';
import {
  preparePersistedImageHistory,
  hydratePersistedImageHistory,
} from '../image-workspaces/history-codec';
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
import { createOriginalImageDocument } from './original-document';
import { readImageOriginalSource, readImageWorkspace } from '../image-workspaces/read';
import { getAggregatePresentation } from '../aggregate-presentations';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  createAssetPublicationJournal,
  cancelAssetPublication,
  collectPreparedAssetCleanupFailures,
  publishReadyJournalWithRetry,
  parseAssetRef,
  parseAssetOwner,
  readAssetFile,
  writeBlobToAsset,
  recoverStandaloneAssetPublications,
  releaseAssetReadyProtection,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
} from '../assets';
import { throwAssetPreparationError } from '../assets/opfs-store';
import {
  parsePersistedEditorDocument,
  preparePersistedEditorDocument,
  replaceEditorDocumentAssetOwnership,
  removeEditorDocumentOwnership,
  type PersistedEditorDocument,
} from '../document-assets';
import { isNumber, isRecord, isString } from '@sniptale/runtime-contracts/validation/primitives';

const IMAGE_WORKSPACE_PUBLICATION_DOMAIN = 'image-workspace';
const IMAGE_WORKSPACE_OWNER_KIND = 'image-workspace';
const IMAGE_SNAPSHOT_STORES = [
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
  ASSET_RESIDENCY_STORE,
];

interface PreparedImageWorkspaceInput extends Omit<
  CommitImageWorkspaceInput,
  | 'document'
  | 'newOriginal'
  | 'history'
  | 'reusableHistoryAssetsByValue'
  | 'reusableAssetsByRuntimeUrl'
  | 'reusableAssetsByVectorDefinitionId'
> {
  document: PersistedEditorDocument;
  newOriginal?: Omit<NewImageOriginal, 'dataUrl'> & { ref: AssetRef };
  history?: PersistedImageHistory | null;
  initialStorageClass?: 'temporary' | 'library';
  refs: AssetRef[];
  publicationId?: string;
  originalWitness?: {
    createdAt: number;
    ref: AssetRef;
    projectAsset?: StoredProjectAssetEntry;
    mediaId?: string;
  };
  inlineOriginalCreatedAt?: number;
  migratedTrashAt?: number;
}

type ImageMutationDatabase = Parameters<Parameters<typeof runWithIndexedDbMutation>[0]>[0];
type PreparedNewImageAggregate = { originalBlob: Blob; thumbnailBlob: Blob };

async function assertImageGeneration(
  tx: Parameters<typeof readImageWorkspaceIdentity>[0],
  aggregateId: string,
  expectedGeneration: string | null | undefined
): Promise<void> {
  if (expectedGeneration === undefined) return;
  const identity = await readImageWorkspaceIdentity(tx, aggregateId);
  if (identity?.retired || (identity?.generation ?? null) !== expectedGeneration)
    throw new StaleImageWorkspaceError(aggregateId);
}

function createNewImageAggregateRoot(
  input: PreparedImageWorkspaceInput,
  prepared: PreparedNewImageAggregate,
  now: number
): MediaLibraryEntry {
  const filename = input.document.sourceName ?? 'Draft image';
  return {
    blob: prepared.originalBlob,
    createdAt: input.captureTime ?? now,
    duration: null,
    filename,
    height: input.document.sourceHeight,
    id: input.aggregateId,
    imageContentState: 'original',
    kind: 'image',
    lifecycle: createLibraryLifecycle('library', now),
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
    if (
      existing.lifecycle?.trashedAt !== undefined &&
      !parseImageWorkspaceEntry(await args.readWorkspace())
    )
      throw new ImageAggregateNotFoundError(args.input.aggregateId);
    return existing;
  }
  if (args.input.requireExistingRoot || !args.prepared || args.input.expectedRevision !== 0) {
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
    ((entry.source.kind === 'screenshot' && entry.blob instanceof Blob) ||
      entry.source.kind === 'stored-asset' ||
      entry.source.kind === 'project-asset')
  );
}

async function assertImageCopySource(
  tx: Pick<IDBPTransaction<unknown, string[], 'readwrite'>, 'objectStore'>,
  guard: NonNullable<PreparedImageWorkspaceInput['sourceGuard']>
): Promise<void> {
  const id = guard.aggregateId;
  await assertImageGeneration(tx, id, guard.sourceGeneration);
  const rawMedia: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(id);
  const rawWorkspace: unknown = await tx.objectStore(IMAGE_WORKSPACES_STORE).get(id);
  const rawPresentation: unknown = await tx
    .objectStore(AGGREGATE_PRESENTATIONS_STORE)
    .get(createAggregatePresentationKey({ id, kind: 'image' }));
  const media = parseMediaLibraryEntry(rawMedia);
  const workspace = parseImageWorkspaceEntry(rawWorkspace);
  const project = rawMedia === undefined && workspace?.sourceMediaId !== undefined;
  const revision = project ? workspace.revision : media ? (media.workspaceRevision ?? 0) : null;
  if (
    revision !== guard.workspaceRevision ||
    (workspace !== null && workspace.revision !== guard.workspaceRevision)
  )
    throw new StaleImageWorkspaceError(id);
  const presentationMatches =
    guard.presentationRevision === undefined
      ? rawPresentation === undefined &&
        rawWorkspace === undefined &&
        media?.imageContentState === 'original'
      : parseAggregatePresentationEntry(rawPresentation)?.presentationRevision ===
        guard.presentationRevision;
  if (!presentationMatches) throw new ImagePresentationNotCurrentError(id);
}

async function publishNewImageOriginal(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  source: NonNullable<PreparedImageWorkspaceInput['newOriginal']>,
  now: number
): Promise<MediaLibraryEntry> {
  const { mediaId, filename, width, height, ref } = source;
  const media = tx.objectStore(MEDIA_LIBRARY_STORE);
  const refs = tx.objectStore(ASSET_REFS_STORE);
  const owners = tx.objectStore(ASSET_OWNERS_STORE);
  if (
    (await media.get(mediaId)) !== undefined ||
    (await tx.objectStore(IMAGE_WORKSPACES_STORE).get(mediaId)) !== undefined ||
    (await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(['image', mediaId])) !== undefined ||
    (await owners.get(['media-library', mediaId, 'source'])) !== undefined ||
    (await readImageRevisionFence(tx, mediaId, false, 'media')) !== null
  )
    throw new ImageAggregateCollisionError(mediaId);
  const currentRef: unknown = await refs.get(ref.assetId);
  if (currentRef !== undefined) {
    const admitted = parseAssetRef(currentRef);
    if (!admitted || !sameLibrarySourceRef(admitted, ref))
      throw new ImageAggregateCollisionError(mediaId);
  }
  await createImageWorkspaceIdentity(tx, mediaId);
  const entry: MediaLibraryEntry = {
    id: mediaId,
    kind: 'image',
    filename,
    originalFilename: filename,
    createdAt: now,
    updatedAt: now,
    workspaceRevision: 0,
    imageContentState: 'original',
    savedIndependently: false,
    lifecycle: createLibraryLifecycle('library', now),
    source: { kind: 'stored-asset', assetId: ref.assetId },
    mimeType: ref.mimeType,
    size: ref.size,
    duration: null,
    width,
    height,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
  };
  await refs.put(ref);
  await owners.put({
    assetId: ref.assetId,
    ownerId: mediaId,
    ownerKind: 'media-library',
    role: 'source',
  });
  await media.put(entry);
  return entry;
}

async function commitImageWorkspaceMutation(
  db: ImageMutationDatabase,
  input: PreparedImageWorkspaceInput,
  prepared: PreparedNewImageAggregate | null,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ImageWorkspacePublicationResult> {
  const tx = db.transaction(
    [...IMAGE_SNAPSHOT_STORES, ASSET_OWNERS_STORE, ASSET_OPERATIONS_STORE],
    'readwrite'
  );
  try {
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
    const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
    const now = Date.now();
    if (input.sourceGuard) await assertImageCopySource(tx, input.sourceGuard);
    const rawRoot: unknown = await mediaStore.get(input.aggregateId);
    const rawWorkspace: unknown = await workspaceStore.get(input.aggregateId);
    const existing = parseImageWorkspaceEntry(rawWorkspace);
    if (rawWorkspace !== undefined && !existing)
      throw new ImageAggregateCollisionError(input.aggregateId);
    if (
      existing?.lifecycle?.trashedAt !== undefined &&
      existing.lifecycle.trashedAt !== input.migratedTrashAt
    )
      throw new StaleImageWorkspaceError(input.aggregateId);
    const sourceMediaId =
      existing?.sourceMediaId ?? input.original?.mediaId ?? input.newOriginal?.mediaId;
    if (
      sourceMediaId === input.aggregateId ||
      (sourceMediaId !== undefined && rawRoot !== undefined) ||
      (input.original && existing && existing.sourceMediaId !== input.original.mediaId) ||
      (existing && input.requireMissingRoot)
    )
      throw new ImageAggregateCollisionError(input.aggregateId);
    const rootWasMissing = rawRoot === undefined && !existing;
    const identity = await readImageWorkspaceIdentity(tx, input.aggregateId);
    if (
      identity?.retired ||
      (rootWasMissing && (identity !== null || (input.expectedGeneration ?? null) !== null)) ||
      (!rootWasMissing && (identity?.generation ?? null) !== (input.expectedGeneration ?? null))
    )
      throw new StaleImageWorkspaceError(input.aggregateId);
    if (
      rootWasMissing &&
      (await readImageRevisionFence(
        tx,
        input.aggregateId,
        false,
        sourceMediaId === undefined ? 'media' : 'image-project'
      )) !== null
    )
      throw new ImageAggregateCollisionError(input.aggregateId);
    let media: MediaLibraryEntry;
    if (input.newOriginal) {
      if (
        !rootWasMissing ||
        input.expectedRevision !== 0 ||
        input.original ||
        input.requireExistingRoot
      )
        throw new ImageAggregateCollisionError(input.aggregateId);
      media = await publishNewImageOriginal(tx, input.newOriginal, now);
    } else if (sourceMediaId !== undefined) {
      const original = parseMediaLibraryEntry(await mediaStore.get(sourceMediaId));
      if (!original || original.id !== sourceMediaId || !isEditableImageAggregateRoot(original))
        throw new ImageAggregateNotFoundError(sourceMediaId);
      if (input.original) await assertImageGeneration(tx, sourceMediaId, input.original.generation);
      if (!existing && (input.requireExistingRoot || original.lifecycle?.trashedAt !== undefined))
        throw new ImageAggregateNotFoundError(input.aggregateId);
      media = original;
    } else {
      media = await persistImageAggregateRootIfMissing({
        input,
        now,
        prepared,
        putPresentation: (entry) => presentationStore.put(entry),
        putRoot: (entry) => mediaStore.put(entry),
        readPresentation: () =>
          presentationStore.get(
            createAggregatePresentationKey({ id: input.aggregateId, kind: 'image' })
          ),
        readRoot: () => Promise.resolve(rawRoot),
        readWorkspace: () => Promise.resolve(rawWorkspace),
      });
    }
    if (
      sourceMediaId !== undefined &&
      !existing &&
      (await presentationStore.get(
        createAggregatePresentationKey({ id: input.aggregateId, kind: 'image' })
      )) !== undefined
    )
      throw new ImageAggregateCollisionError(input.aggregateId);
    const generation = rootWasMissing
      ? await createImageWorkspaceIdentity(tx, input.aggregateId)
      : identity?.generation;
    const currentRevision =
      sourceMediaId === undefined ? (media.workspaceRevision ?? 0) : (existing?.revision ?? 0);
    if (currentRevision !== input.expectedRevision) {
      throw new StaleImageWorkspaceError(input.aggregateId);
    }

    if (input.originalWitness) {
      const current = await readOriginalStorageWitness(tx, media);
      if (
        (input.originalWitness.mediaId !== undefined &&
          input.originalWitness.mediaId !== media.id) ||
        media.createdAt !== input.originalWitness.createdAt ||
        JSON.stringify(current.ref) !== JSON.stringify(input.originalWitness.ref) ||
        JSON.stringify(current.projectAsset) !== JSON.stringify(input.originalWitness.projectAsset)
      )
        throw new StaleImageWorkspaceError(input.aggregateId);
    }
    if (existing && existing.revision !== input.expectedRevision) {
      throw new StaleImageWorkspaceError(input.aggregateId);
    }
    const history = input.history === undefined ? existing?.history : (input.history ?? undefined);
    const assets = imageWorkspaceAssetBindings({
      document: input.document,
      ...(history ? { history } : {}),
    });
    const refs = new Map(input.refs.map((ref) => [ref.assetId, ref]));
    for (const asset of assets) {
      if (refs.has(asset.assetId)) continue;
      const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(asset.assetId));
      if (!ref) throw new Error('Retained Image history resource is missing.');
      refs.set(ref.assetId, ref);
    }
    const physicalDelete = buildPhysicalDeleteOperation([]);
    await replaceEditorDocumentAssetOwnership({
      nextDocument: { assets },
      nextRefs: [...refs.values()],
      ownerId: input.aggregateId,
      ownerKind: IMAGE_WORKSPACE_OWNER_KIND,
      previousDocument: existing ? { assets: imageWorkspaceAssetBindings(existing) } : null,
      physicalDelete,
      stores: {
        owners: tx.objectStore(ASSET_OWNERS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
    });
    if (physicalDelete.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    }
    if (input.inlineOriginalCreatedAt !== undefined) {
      const originalRef = refs.get(input.document.sourceImage.assetId);
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      if (
        sourceMediaId === undefined ||
        media.source.kind !== 'screenshot' ||
        !(media.blob instanceof Blob) ||
        media.createdAt !== input.inlineOriginalCreatedAt ||
        !originalRef ||
        media.size !== originalRef.size ||
        media.mimeType !== originalRef.mimeType ||
        (await ownerStore.get(['media-library', media.id, 'source'])) !== undefined
      )
        throw new StaleImageWorkspaceError(input.aggregateId);
      await ownerStore.put({
        assetId: originalRef.assetId,
        ownerId: media.id,
        ownerKind: 'media-library',
        role: 'source',
      });
      const { blob: _inlineBlob, ...originalMetadata } = media;
      media = {
        ...originalMetadata,
        source: { kind: 'stored-asset', assetId: originalRef.assetId },
      };
    }
    const revision = input.expectedRevision + 1;
    if (!Number.isSafeInteger(revision)) throw new StaleImageWorkspaceError(input.aggregateId);
    await workspaceStore.put({
      aggregateId: input.aggregateId,
      ...(sourceMediaId === undefined ? {} : { sourceMediaId }),
      ...(sourceMediaId === undefined
        ? {}
        : { lifecycle: existing?.lifecycle ?? createLibraryLifecycle('library', now) }),
      createdAt: existing?.createdAt ?? (sourceMediaId === undefined ? media.createdAt : now),
      document: input.document,
      ...(input.publicationId ? { publicationId: input.publicationId } : {}),
      ...(history ? { history } : {}),
      revision,
      sourceTitle: input.sourceTitle ?? existing?.sourceTitle ?? media.sourceTitle,
      sourceUrl:
        input.sourceUrl === undefined
          ? (existing?.sourceUrl ?? media.sourceUrl)
          : sanitizeProvenanceUrl(input.sourceUrl),
      updatedAt: now,
    });
    if (sourceMediaId === undefined) {
      await mediaStore.put({
        ...media,
        imageContentState: input.imageContentState ?? 'edited',
        updatedAt: now,
        workspaceRevision: revision,
        lifecycle: media.lifecycle
          ? promoteLibraryLifecycle({ ...media.lifecycle, updatedAt: now }, now)
          : createLibraryLifecycle('library', now),
      });
    } else if (media.lifecycle?.storageClass === 'temporary') {
      await mediaStore.put({
        ...media,
        savedIndependently: false,
        lifecycle: promoteLibraryLifecycle(media.lifecycle, now),
      });
    } else if (input.inlineOriginalCreatedAt !== undefined) {
      await mediaStore.put(media);
    }
    const acceptedRoot =
      sourceMediaId === undefined
        ? parseMediaLibraryEntry(await mediaStore.get(input.aggregateId))
        : null;
    const captureOptions =
      input.publicationId === undefined ? {} : { publicationId: input.publicationId };
    const checkpointReceipt =
      sourceMediaId !== undefined
        ? await captureCheckpointReceiptInTransaction(
            tx,
            { rootKind: 'image-project', rootId: input.aggregateId },
            () => captureImageInTransaction(tx, input.aggregateId, captureOptions)
          )
        : acceptedRoot && isImageCaptureSource(acceptedRoot)
          ? await captureCheckpointReceiptInTransaction(
              tx,
              { rootKind: 'media', rootId: input.aggregateId },
              () => captureMediaInTransaction(tx, input.aggregateId, captureOptions)
            )
          : null;
    await tx.done;
    if (physicalDelete.assetIds.length > 0) {
      await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit).catch(() => undefined);
    }
    return {
      revision,
      updatedAt: now,
      ...(generation ? { sourceGeneration: generation } : {}),
      ...(checkpointReceipt ? { checkpointReceipt } : {}),
    };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The transaction may already have aborted. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/** Reuse exact original bytes and stage a single durable object for an inline source. */
async function readOriginalStorageWitness(
  tx: Pick<IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>, 'objectStore'>,
  media: MediaLibraryEntry
): Promise<{ ref?: AssetRef; projectAsset?: StoredProjectAssetEntry }> {
  if (media.source.kind === 'screenshot') return {};
  const projectAsset =
    media.source.kind === 'project-asset'
      ? parseProjectAssetEntry(
          await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId)
        )
      : null;
  const assetId =
    media.source.kind === 'stored-asset' ? media.source.assetId : projectAsset?.assetId;
  if (
    !assetId ||
    (media.source.kind === 'project-asset' && projectAsset?.id !== media.source.projectAssetId)
  )
    throw new ImageAggregateNotFoundError(media.id);
  const ownerKind = projectAsset ? 'project-asset' : 'media-library';
  const ownerId = projectAsset?.id ?? media.id;
  const role = projectAsset ? 'body' : 'source';
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get([ownerKind, ownerId, role])
  );
  if (
    !ref ||
    ref.assetId !== assetId ||
    ref.mimeType !== media.mimeType ||
    ref.size !== media.size ||
    owner?.assetId !== assetId ||
    owner.ownerId !== ownerId ||
    owner.ownerKind !== ownerKind ||
    owner.role !== role
  )
    throw new ImageAggregateNotFoundError(media.id);
  return { ref, ...(projectAsset ? { projectAsset } : {}) };
}

async function prepareOriginalReuse(
  db: ImageMutationDatabase,
  input: CommitImageWorkspaceInput
): Promise<Pick<PreparedImageWorkspaceInput, 'originalWitness' | 'inlineOriginalCreatedAt'>> {
  if (
    (input.requireMissingRoot && !input.original) ||
    !input.document.sourceImageData.startsWith('data:') ||
    input.reusableAssetsByRuntimeUrl?.has(input.document.sourceImageData)
  )
    return {};
  const tx = db.transaction(IMAGE_SNAPSHOT_STORES, 'readonly');
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  let mediaId = input.original?.mediaId ?? input.aggregateId;
  let media = parseMediaLibraryEntry(await mediaStore.get(mediaId));
  if (!input.original && !media && input.expectedRevision > 0) {
    const workspace = parseImageWorkspaceEntry(
      await tx.objectStore(IMAGE_WORKSPACES_STORE).get(input.aggregateId)
    );
    if (workspace?.sourceMediaId) {
      mediaId = workspace.sourceMediaId;
      media = parseMediaLibraryEntry(await mediaStore.get(mediaId));
    }
  }
  const linked = mediaId !== input.aggregateId;
  if (
    !media ||
    !isImageCaptureSource(media) ||
    (!linked && media.source.kind !== 'project-asset')
  ) {
    await tx.done;
    return {};
  }
  const witness = await readOriginalStorageWitness(tx, media);
  await tx.done;
  const original = witness.ref ? await readAssetFile(witness.ref, media.filename) : media.blob;
  if (!original) throw new ImageAggregateCollisionError(mediaId);
  const source = await dataUrlToBlob(input.document.sourceImageData);
  if (original.type !== source.type || original.size !== source.size) return {};
  const [originalBytes, sourceBytes] = await Promise.all([
    original.arrayBuffer(),
    source.arrayBuffer(),
  ]);
  const bytes = new Uint8Array(sourceBytes);
  if (!new Uint8Array(originalBytes).every((byte, index) => byte === bytes[index])) return {};
  if (!witness.ref)
    return input.original && input.expectedRevision === 0
      ? { inlineOriginalCreatedAt: media.createdAt }
      : {};
  return {
    originalWitness: {
      createdAt: media.createdAt,
      ref: witness.ref,
      ...(witness.projectAsset ? { projectAsset: witness.projectAsset } : {}),
      ...(linked ? { mediaId } : {}),
    },
  };
}

/** Retains one acquired publication across retries; parallel calls share its current execution. */
export function createImageWorkspaceCommit(
  input: CommitImageWorkspaceInput
): () => Promise<CommitImageWorkspaceResult> {
  let publish: (() => Promise<CommitImageWorkspaceResult>) | undefined;
  let execution: Promise<CommitImageWorkspaceResult> | undefined;
  return () => {
    if (execution) return execution;
    const attempt = async () => {
      const prepared = publish ?? (await prepareImageWorkspaceCommit(input));
      publish = prepared;
      return prepared();
    };
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    execution =
      input.original && locks
        ? locks.request(
            `sniptale:assets:image-original:${input.original.mediaId}`,
            { mode: 'exclusive' },
            attempt
          )
        : attempt();
    void execution.catch(() => {
      execution = undefined;
    });
    return execution;
  };
}

export function commitImageWorkspace(
  input: CommitImageWorkspaceInput
): Promise<CommitImageWorkspaceResult> {
  return createImageWorkspaceCommit(input)();
}

async function prepareImageWorkspaceCommit(
  input: CommitImageWorkspaceInput
): Promise<() => Promise<CommitImageWorkspaceResult>> {
  if (
    input.newOriginal &&
    (input.original ||
      input.expectedRevision !== 0 ||
      !input.requireMissingRoot ||
      input.requireExistingRoot)
  )
    throw new ImageAggregateCollisionError(input.aggregateId);
  // Cold database admission reserves the exclusive transition gate; it must settle before
  // staged assets hold shared transition leases or admission could queue behind them.
  const db = await initDB();
  await recoverImageWorkspacePublications();
  const originalReuse = await prepareOriginalReuse(db, input);
  const { originalWitness } = originalReuse;
  const reusableAssetsByRuntimeUrl = new Map(input.reusableAssetsByRuntimeUrl);
  for (const [value, ref] of input.reusableHistoryAssetsByValue ?? [])
    if (value.startsWith('data:')) reusableAssetsByRuntimeUrl.set(value, ref);
  if (originalWitness)
    reusableAssetsByRuntimeUrl.set(input.document.sourceImageData, originalWitness.ref);
  const preparedDocument = await preparePersistedEditorDocument(input.document, {
    reusableAssetsByRuntimeUrl,
    ...(input.reusableAssetsByVectorDefinitionId
      ? { reusableAssetsByVectorDefinitionId: input.reusableAssetsByVectorDefinitionId }
      : {}),
  });
  const {
    history: _history,
    newOriginal,
    reusableHistoryAssetsByValue: _reusableHistoryAssetsByValue,
    reusableAssetsByRuntimeUrl: _reusableAssetsByRuntimeUrl,
    reusableAssetsByVectorDefinitionId: _reusableAssetsByVectorDefinitionId,
    ...serializableInput
  } = input;
  const preparedObjects = [...preparedDocument.objects];
  try {
    const preparedHistory = input.history
      ? await preparePersistedImageHistory(input.history, {
          ...(input.reusableHistoryAssetsByValue
            ? { reusableAssetsByValue: input.reusableHistoryAssetsByValue }
            : {}),
          reusableImagesByRuntimeUrl: preparedDocument.runtimeAssetsByUrl,
        })
      : undefined;
    if (preparedHistory) preparedObjects.push(...preparedHistory.objects);
    let original: PreparedImageWorkspaceInput['newOriginal'];
    if (newOriginal) {
      const { dataUrl, ...metadata } = newOriginal;
      const reused = preparedDocument.runtimeAssetsByUrl.get(dataUrl);
      let ref = preparedObjects.find((object) => object.ref.assetId === reused?.assetId)?.ref;
      if (!ref) {
        const prepared = await writeBlobToAsset(await dataUrlToBlob(dataUrl));
        preparedObjects.push(prepared);
        ref = prepared.ref;
      }
      original = parsePreparedNewImageOriginal({ ...metadata, ref }, input.aggregateId, [ref]);
      if (!original) throw new ImageAggregateCollisionError(input.aggregateId);
    }
    const refs = [
      ...new Map(
        [
          ...preparedDocument.refs,
          ...(preparedHistory?.refs ?? []),
          ...(original ? [original.ref] : []),
        ].map((ref) => [ref.assetId, ref])
      ).values(),
    ];
    const preparedInput: PreparedImageWorkspaceInput = {
      ...serializableInput,
      ...(original ? { newOriginal: original } : {}),
      expectedGeneration: input.expectedGeneration ?? null,
      document: preparedDocument.document,
      ...(input.history === undefined ? {} : { history: preparedHistory?.history ?? null }),
      refs,
      ...originalReuse,
    };
    const journal = await createAssetPublicationJournal({
      assetRefs: preparedObjects.map(({ ref }) => ref),
      domain: IMAGE_WORKSPACE_PUBLICATION_DOMAIN,
      payload: preparedInput,
    });
    return async () => {
      let result: ImageWorkspacePublicationResult | undefined;
      await publishReadyJournalWithRetry(journal, async (ready, permit) => {
        const published = await publishPreparedImageWorkspace(ready, preparedInput, false, permit);
        if (!published) throw new Error('Image workspace publication was superseded.');
        result = published;
      });
      await releaseAssetReadyProtection(preparedObjects.map(({ ref }) => ref.assetId));
      if (!result) throw new Error('Image workspace publication produced no result.');
      return {
        ...result,
        documentAssetsByRuntimeUrl: preparedDocument.runtimeAssetsByUrl,
        documentAssetsByVectorDefinitionId: preparedDocument.vectorAssetsByDefinitionId,
        ...(input.history === undefined
          ? {}
          : { historyAssetsByValue: preparedHistory?.assetsByValue ?? new Map() }),
      };
    };
  } catch (error) {
    const failures = await collectPreparedAssetCleanupFailures(
      preparedObjects.map(({ ref }) => ref.assetId)
    );
    throwAssetPreparationError(error, failures, 'Image workspace save cleanup failed.');
  }
}

function parsePreparedNewImageOriginal(
  value: unknown,
  aggregateId: string,
  refs: ReadonlyArray<AssetRef | null>
): PreparedImageWorkspaceInput['newOriginal'] {
  if (!isRecord(value) || Object.keys(value).length !== 5) return undefined;
  const { mediaId, filename, width, height } = value;
  const ref = parseAssetRef(value['ref']);
  if (
    !isString(mediaId) ||
    !mediaId.length ||
    mediaId.length > 256 ||
    mediaId === aggregateId ||
    !isString(filename) ||
    !filename.length ||
    !isNumber(width) ||
    width <= 0 ||
    !isNumber(height) ||
    height <= 0 ||
    !ref ||
    !ref.mimeType.startsWith('image/') ||
    !refs.some((candidate) => candidate && sameLibrarySourceRef(candidate, ref))
  )
    return undefined;
  return { mediaId, filename, width, height, ref };
}

function parseImageWorkspacePublicationPayload(value: unknown): PreparedImageWorkspaceInput | null {
  if (!isRecord(value)) return null;
  const initialStorageClass = value['initialStorageClass'];
  if (
    initialStorageClass !== undefined &&
    initialStorageClass !== 'temporary' &&
    initialStorageClass !== 'library'
  )
    return null;
  const document = parsePersistedEditorDocument(value['document']);
  const history =
    value['history'] === undefined || value['history'] === null
      ? value['history']
      : parsePersistedImageHistory(value['history']);
  const expectedGeneration = value['expectedGeneration'];
  const rawOriginal = value['original'];
  if (
    !document ||
    (value['history'] !== undefined && value['history'] !== null && !history) ||
    (expectedGeneration !== undefined &&
      expectedGeneration !== null &&
      (typeof expectedGeneration !== 'string' ||
        !expectedGeneration.length ||
        expectedGeneration.length > 200)) ||
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
    value['imageContentState'] !== undefined &&
    value['imageContentState'] !== 'edited' &&
    value['imageContentState'] !== 'original'
  ) {
    return null;
  }
  if (
    (value['requireMissingRoot'] !== undefined &&
      typeof value['requireMissingRoot'] !== 'boolean') ||
    (value['requireExistingRoot'] !== undefined &&
      typeof value['requireExistingRoot'] !== 'boolean')
  ) {
    return null;
  }
  const captureTime = value['captureTime'];
  if (
    captureTime !== undefined &&
    (typeof captureTime !== 'number' || !Number.isFinite(captureTime) || captureTime < 0)
  ) {
    return null;
  }
  const refs = value['refs'].map(parseAssetRef);
  if (refs.some((ref) => ref === null)) return null;
  let original: CommitImageWorkspaceInput['original'];
  if (rawOriginal !== undefined) {
    if (!isRecord(rawOriginal)) return null;
    const { mediaId, generation } = rawOriginal;
    if (!isString(mediaId) || !mediaId.length || mediaId.length > 256) return null;
    if (
      generation !== null &&
      (!isString(generation) || !generation.length || generation.length > 200)
    )
      return null;
    original = { mediaId, generation };
  }
  const newOriginal = parsePreparedNewImageOriginal(
    value['newOriginal'],
    value['aggregateId'],
    refs
  );
  if (
    value['newOriginal'] !== undefined &&
    (!newOriginal || original || value['expectedRevision'] !== 0 || !value['requireMissingRoot'])
  )
    return null;
  const rawOriginalWitness = value['originalWitness'];
  const witnessMediaId = isRecord(rawOriginalWitness) ? rawOriginalWitness['mediaId'] : undefined;
  const witnessRef = isRecord(rawOriginalWitness) ? parseAssetRef(rawOriginalWitness['ref']) : null;
  const witnessChild = isRecord(rawOriginalWitness)
    ? parseProjectAssetEntry(rawOriginalWitness['projectAsset'])
    : null;
  const inlineOriginalCreatedAt = value['inlineOriginalCreatedAt'];
  if (
    inlineOriginalCreatedAt !== undefined &&
    (!original ||
      rawOriginalWitness !== undefined ||
      typeof inlineOriginalCreatedAt !== 'number' ||
      !Number.isFinite(inlineOriginalCreatedAt))
  )
    return null;
  let originalWitness: PreparedImageWorkspaceInput['originalWitness'];
  if (rawOriginalWitness !== undefined) {
    if (
      !isRecord(rawOriginalWitness) ||
      typeof rawOriginalWitness['createdAt'] !== 'number' ||
      !Number.isFinite(rawOriginalWitness['createdAt']) ||
      (witnessMediaId !== undefined &&
        (!isString(witnessMediaId) ||
          !witnessMediaId.length ||
          witnessMediaId.length > 256 ||
          (original !== undefined && witnessMediaId !== original.mediaId))) ||
      !witnessRef ||
      (!witnessChild &&
        ((!original && witnessMediaId === undefined) ||
          rawOriginalWitness['projectAsset'] !== undefined)) ||
      (witnessChild &&
        (witnessChild.assetId !== witnessRef.assetId ||
          witnessChild.size !== witnessRef.size ||
          witnessChild.mimeType !== witnessRef.mimeType ||
          (witnessChild.originMediaId !== undefined &&
            witnessMediaId === undefined &&
            original === undefined) ||
          (witnessMediaId ?? original?.mediaId ?? value['aggregateId']) !==
            `project-asset:${witnessChild.id}`)) ||
      document.sourceImage.assetId !== witnessRef.assetId ||
      !refs.some((ref) => ref && JSON.stringify(ref) === JSON.stringify(witnessRef))
    )
      return null;
    originalWitness = {
      createdAt: rawOriginalWitness['createdAt'],
      ref: witnessRef,
      ...(witnessChild ? { projectAsset: witnessChild } : {}),
      ...(witnessMediaId === undefined ? {} : { mediaId: witnessMediaId }),
    };
  }
  const rawSourceGuard = value['sourceGuard'];
  const sourceGuard = isRecord(rawSourceGuard)
    ? {
        aggregateId: rawSourceGuard['aggregateId'],
        presentationRevision: rawSourceGuard['presentationRevision'],
        workspaceRevision: rawSourceGuard['workspaceRevision'],
        sourceGeneration: rawSourceGuard['sourceGeneration'],
      }
    : null;
  if (
    rawSourceGuard !== undefined &&
    (!sourceGuard ||
      !isString(sourceGuard.aggregateId) ||
      (sourceGuard.presentationRevision !== undefined &&
        !Number.isInteger(sourceGuard.presentationRevision)) ||
      !Number.isInteger(sourceGuard.workspaceRevision) ||
      (sourceGuard.sourceGeneration !== undefined &&
        sourceGuard.sourceGeneration !== null &&
        (typeof sourceGuard.sourceGeneration !== 'string' ||
          !sourceGuard.sourceGeneration.length ||
          sourceGuard.sourceGeneration.length > 200)))
  ) {
    return null;
  }
  return {
    aggregateId: value['aggregateId'],
    ...(originalWitness ? { originalWitness } : {}),
    ...(inlineOriginalCreatedAt === undefined ? {} : { inlineOriginalCreatedAt }),
    ...(original === undefined ? {} : { original }),
    ...(newOriginal ? { newOriginal } : {}),
    document,
    ...(history === undefined ? {} : { history }),
    expectedRevision: value['expectedRevision'],
    ...(expectedGeneration === undefined ? {} : { expectedGeneration }),
    ...(captureTime === undefined ? {} : { captureTime }),
    refs: refs as AssetRef[],
    ...(value['imageContentState'] === undefined
      ? {}
      : { imageContentState: value['imageContentState'] as ImageContentState }),
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
    ...(typeof value['requireExistingRoot'] === 'boolean'
      ? { requireExistingRoot: value['requireExistingRoot'] }
      : {}),
    ...(value['requireMissingRoot'] === undefined
      ? {}
      : { requireMissingRoot: value['requireMissingRoot'] }),
  };
}

async function readImageWorkspaceMove(oldId: string) {
  const db = await initDB();
  const tx = db.transaction([IMAGE_WORKSPACES_STORE, IMAGE_WORKSPACE_IDENTITIES_STORE], 'readonly');
  const source = await readImageWorkspaceIdentity(tx, oldId);
  const move = source?.legacyMove;
  if (!source || !move) {
    await tx.done;
    return null;
  }
  const targetId = legacyImageProjectId(oldId);
  const workspace = parseImageWorkspaceEntry(
    await tx.objectStore(IMAGE_WORKSPACES_STORE).get(targetId)
  );
  const target = await readImageWorkspaceIdentity(tx, targetId);
  await tx.done;
  return { source, move, targetId, workspace, target };
}

/** Resolve only durable pre-upgrade journals against the lifetime recorded by v72. */
async function resolveMovedImagePublication(
  input: PreparedImageWorkspaceInput,
  journalId: string
): Promise<PreparedImageWorkspaceInput | null> {
  if (input.original) return input;
  const converted = await readImageWorkspaceMove(input.aggregateId);
  if (!converted) return input;
  const { source, move, targetId, workspace, target } = converted;
  if (move.discardedPublicationId === journalId && move.revision === input.expectedRevision + 1)
    return null;

  const owned = workspace?.sourceMediaId === input.aggregateId;
  const firstEdit = move.projectGeneration === null;
  const expectedRevision = firstEdit ? 0 : input.expectedRevision;
  const sameProject =
    owned && target && !target.retired && target.generation === move.projectGeneration;
  const replay =
    (sameProject || (firstEdit && owned && target && !target.retired)) &&
    workspace.publicationId === journalId &&
    workspace.revision === expectedRevision + 1;
  const missingFirstProject =
    firstEdit && !target && !workspace && input.expectedRevision === move.revision;
  if (target?.retired) return input;
  if (
    !replay &&
    (move.previousGeneration !== (input.expectedGeneration ?? null) ||
      input.expectedRevision > move.revision ||
      (!owned && !missingFirstProject))
  )
    return input;

  const migratedTrashAt =
    sameProject && workspace.lifecycle?.trashedAt === move.trashedAt
      ? workspace.lifecycle?.trashedAt
      : undefined;
  return {
    ...input,
    aggregateId: targetId,
    expectedGeneration: move.projectGeneration,
    expectedRevision,
    original: { mediaId: source.aggregateId, generation: source.generation },
    ...(migratedTrashAt === undefined ? {} : { migratedTrashAt }),
    ...(firstEdit ? { requireMissingRoot: true, requireExistingRoot: false } : {}),
  };
}

/** Pending copies recheck the exact migrated source and preview. Acknowledged targets replay first. */
async function resolveMigratedImageJournal(
  input: PreparedImageWorkspaceInput,
  journalId: string
): Promise<PreparedImageWorkspaceInput | null> {
  if (input.newOriginal) return input;
  const publication = await resolveMovedImagePublication(input, journalId);
  const guard = input.sourceGuard;
  if (publication !== input || !guard) return publication;
  const converted = await readImageWorkspaceMove(guard.aggregateId);
  if (!converted) return input;
  const { move, targetId, workspace, target } = converted;
  if (
    !target ||
    target.retired ||
    target.generation !== move.projectGeneration ||
    workspace?.sourceMediaId !== guard.aggregateId ||
    guard.sourceGeneration !== move.previousGeneration ||
    guard.workspaceRevision !== move.revision
  )
    return input;
  return {
    ...input,
    sourceGuard: { ...guard, aggregateId: targetId, sourceGeneration: target.generation },
  };
}

async function publishImageWorkspaceJournal(
  journal: AssetReadyJournal,
  allowSuperseded = false,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ImageWorkspacePublicationResult | null | 'defer'> {
  if (journal.domain !== IMAGE_WORKSPACE_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid image workspace publication journal.');
  }
  const payload = parseImageWorkspacePublicationPayload(journal.payload);
  if (!payload) throw new Error('Invalid image workspace publication payload.');
  const input = await resolveMigratedImageJournal(payload, journal.journalId);
  if (!input) return null;
  const status = await readImageWorkspacePublicationStatus(
    journal,
    input,
    allowSuperseded,
    lifecyclePermit
  );
  if (status.kind === 'deferred') return 'defer';
  if (status.kind === 'finished') return status.result;
  if (input.history)
    await hydratePersistedImageHistory({ history: input.history, refs: input.refs });
  try {
    return await commitPreparedImageWorkspacePublication(journal, input, lifecyclePermit);
  } catch (error) {
    if (
      allowSuperseded &&
      input.sourceGuard &&
      (error instanceof StaleImageWorkspaceError ||
        error instanceof ImagePresentationNotCurrentError) &&
      error.aggregateId === input.sourceGuard.aggregateId
    )
      return 'defer';
    throw error;
  }
}

async function publishPreparedImageWorkspace(
  journal: AssetReadyJournal,
  input: PreparedImageWorkspaceInput,
  allowSuperseded: boolean,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ImageWorkspacePublicationResult | null> {
  const status = await readImageWorkspacePublicationStatus(
    journal,
    input,
    allowSuperseded,
    lifecyclePermit
  );
  if (status.kind === 'deferred')
    throw new Error('Prepared Image publication has no lifetime evidence.');
  return status.kind === 'finished'
    ? status.result
    : commitPreparedImageWorkspacePublication(journal, input, lifecyclePermit);
}

async function readImageWorkspacePublicationStatus(
  journal: AssetReadyJournal,
  input: PreparedImageWorkspaceInput,
  allowSuperseded: boolean,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<
  | { kind: 'ready' }
  | { kind: 'deferred' }
  | { kind: 'finished'; result: ImageWorkspacePublicationResult | null }
> {
  const bindings = imageWorkspaceAssetBindings({
    document: input.document,
    ...(input.history ? { history: input.history } : {}),
  });
  const refIds = new Set(input.refs.map((ref) => ref.assetId));
  const newOriginal = input.newOriginal;
  if (
    journal.domain !== IMAGE_WORKSPACE_PUBLICATION_DOMAIN ||
    journal.operationId ||
    refIds.size !== input.refs.length ||
    journal.assetRefs.some((journalRef) => !refIds.has(journalRef.assetId)) ||
    bindings.some((asset) => !refIds.has(asset.assetId)) ||
    (newOriginal !== undefined &&
      !journal.assetRefs.some((ref) => sameLibrarySourceRef(ref, newOriginal.ref)))
  ) {
    throw new Error('Invalid image workspace publication payload.');
  }
  const db = await initDB();
  const snapshot = db.transaction(
    [
      MEDIA_LIBRARY_STORE,
      IMAGE_WORKSPACES_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
      IMAGE_WORKSPACE_IDENTITIES_STORE,
    ],
    'readonly'
  );
  const mediaRead: Promise<unknown> = snapshot
    .objectStore(MEDIA_LIBRARY_STORE)
    .get(input.aggregateId);
  const workspaceRead: Promise<unknown> = snapshot
    .objectStore(IMAGE_WORKSPACES_STORE)
    .get(input.aggregateId);
  const presentationRead: Promise<unknown> = snapshot
    .objectStore(AGGREGATE_PRESENTATIONS_STORE)
    .get(createAggregatePresentationKey({ id: input.aggregateId, kind: 'image' }));
  const original = input.original;
  const originalId = original?.mediaId ?? input.newOriginal?.mediaId;
  const originalMediaRead: Promise<unknown> | undefined = originalId
    ? snapshot.objectStore(MEDIA_LIBRARY_STORE).get(originalId)
    : undefined;
  const newSourceWorkspaceRead: Promise<unknown> | undefined = input.newOriginal
    ? snapshot.objectStore(IMAGE_WORKSPACES_STORE).get(input.newOriginal.mediaId)
    : undefined;
  const newSourcePresentationRead: Promise<unknown> | undefined = input.newOriginal
    ? snapshot.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(['image', input.newOriginal.mediaId])
    : undefined;
  const [rawMedia, rawWorkspace, rawPresentation, identity, originalMedia, originalIdentity] =
    await Promise.all([
      mediaRead,
      workspaceRead,
      presentationRead,
      readImageWorkspaceIdentity(snapshot, input.aggregateId),
      originalMediaRead,
      originalId ? readImageWorkspaceIdentity(snapshot, originalId) : null,
    ]);
  const [newSourceWorkspace, newSourcePresentation] = await Promise.all([
    newSourceWorkspaceRead,
    newSourcePresentationRead,
  ]);
  const existing = parseImageWorkspaceEntry(rawWorkspace);
  const linked = existing?.sourceMediaId !== undefined;
  await snapshot.done;
  const hasRoot = rawMedia !== undefined || linked;
  const sameGeneration =
    !identity?.retired && (identity?.generation ?? null) === (input.expectedGeneration ?? null);
  const ownPublication = existing?.publicationId === journal.journalId;
  const source = parseMediaLibraryEntry(originalMedia);
  if (
    (!input.requireMissingRoot || ownPublication) &&
    !identity?.retired &&
    (sameGeneration || ownPublication) &&
    hasRoot &&
    (original === undefined || (ownPublication && existing?.sourceMediaId === original.mediaId)) &&
    (!input.newOriginal ||
      (ownPublication &&
        existing?.sourceMediaId === input.newOriginal.mediaId &&
        source?.source.kind === 'stored-asset' &&
        source.source.assetId === input.newOriginal.ref.assetId)) &&
    existing?.revision === input.expectedRevision + 1 &&
    JSON.stringify(existing.document) ===
      JSON.stringify(parsePersistedEditorDocument(input.document)) &&
    (input.history === undefined ||
      JSON.stringify(existing.history ?? null) === JSON.stringify(input.history))
  ) {
    return {
      kind: 'finished',
      result: {
        revision: existing.revision,
        updatedAt: existing.updatedAt,
        ...(identity ? { sourceGeneration: identity.generation } : {}),
      },
    };
  }
  // A pre-lifetime creation journal cannot distinguish never-published from published-then-deleted.
  if (
    allowSuperseded &&
    original === undefined &&
    input.expectedGeneration === undefined &&
    !input.requireExistingRoot &&
    !hasRoot &&
    rawWorkspace === undefined &&
    rawPresentation === undefined &&
    identity === null
  )
    return { kind: 'deferred' };
  const existingMedia = parseMediaLibraryEntry(rawMedia);
  const occupiedSidecar = rawWorkspace !== undefined || rawPresentation !== undefined;
  const incompatibleRoot =
    rawMedia !== undefined && (!existingMedia || !isEditableImageAggregateRoot(existingMedia));
  const originalIsUnavailable =
    original !== undefined &&
    (!source ||
      source.id !== original.mediaId ||
      !isEditableImageAggregateRoot(source) ||
      (source.lifecycle?.trashedAt !== undefined && existing?.sourceMediaId !== original.mediaId) ||
      originalIdentity?.retired ||
      (originalIdentity?.generation ?? null) !== original.generation);
  const newOriginalIsOccupied =
    input.newOriginal !== undefined &&
    (originalMedia !== undefined ||
      originalIdentity !== null ||
      newSourceWorkspace !== undefined ||
      newSourcePresentation !== undefined);
  const permanentlySuperseded =
    originalIsUnavailable ||
    newOriginalIsOccupied ||
    (input.requireMissingRoot
      ? hasRoot || occupiedSidecar || !sameGeneration
      : !sameGeneration ||
        (existing?.lifecycle?.trashedAt !== undefined &&
          existing.lifecycle.trashedAt !== input.migratedTrashAt) ||
        (input.requireExistingRoot === true && !hasRoot) ||
        incompatibleRoot ||
        (!hasRoot && occupiedSidecar) ||
        (rawWorkspace !== undefined && !parseImageWorkspaceEntry(rawWorkspace)) ||
        (linked ? existing.revision : (existingMedia?.workspaceRevision ?? 0)) !==
          input.expectedRevision);
  if (allowSuperseded && permanentlySuperseded) {
    const originalOwner =
      original &&
      input.inlineOriginalCreatedAt !== undefined &&
      source?.id === original.mediaId &&
      source.createdAt === input.inlineOriginalCreatedAt &&
      source.source.kind === 'stored-asset' &&
      source.source.assetId === input.document.sourceImage.assetId
        ? parseAssetOwner(
            await db.get(ASSET_OWNERS_STORE, ['media-library', original.mediaId, 'source'])
          )
        : null;
    const unownedStagedAssetIds = new Set<string>();
    const rolesByAssetId = new Map<string, string[]>();
    for (const binding of bindings) {
      const roles = rolesByAssetId.get(binding.assetId) ?? [];
      roles.push(binding.role);
      rolesByAssetId.set(binding.assetId, roles);
    }
    for (const stagedRef of journal.assetRefs) {
      const ref: unknown = await db.get(ASSET_REFS_STORE, stagedRef.assetId);
      const roles = rolesByAssetId.get(stagedRef.assetId) ?? [];
      const owners = await Promise.all(
        roles.map((role) =>
          db.get(ASSET_OWNERS_STORE, [IMAGE_WORKSPACE_OWNER_KIND, input.aggregateId, role])
        )
      );
      if (owners.some((owner) => owner !== undefined && !parseAssetOwner(owner))) {
        throw new StaleImageWorkspaceError(input.aggregateId);
      }
      const isOwnedByThisWorkspace = owners.some(
        (owner) => parseAssetOwner(owner)?.assetId === stagedRef.assetId
      );
      const newSourceOwner =
        newOriginal && stagedRef.assetId === newOriginal.ref.assetId
          ? parseAssetOwner(
              await db.get(ASSET_OWNERS_STORE, ['media-library', newOriginal.mediaId, 'source'])
            )
          : null;
      const isOwnedByOriginal =
        (newSourceOwner?.assetId === stagedRef.assetId &&
          newSourceOwner.ownerKind === 'media-library' &&
          newSourceOwner.ownerId === newOriginal?.mediaId &&
          newSourceOwner.role === 'source') ||
        (originalOwner?.ownerKind === 'media-library' &&
          originalOwner.ownerId === original?.mediaId &&
          originalOwner.role === 'source' &&
          originalOwner.assetId === stagedRef.assetId &&
          stagedRef.assetId === input.document.sourceImage.assetId);
      const isOwned = isOwnedByThisWorkspace || isOwnedByOriginal;
      if ((ref !== undefined) !== isOwned) {
        throw new StaleImageWorkspaceError(input.aggregateId);
      }
      if (!isOwned) unownedStagedAssetIds.add(stagedRef.assetId);
    }
    await cancelAssetPublication(
      {
        ...journal,
        assetRefs: journal.assetRefs.filter((ref) => unownedStagedAssetIds.has(ref.assetId)),
      },
      lifecyclePermit
    );
    return { kind: 'finished', result: null };
  }
  return { kind: 'ready' };
}

async function commitPreparedImageWorkspacePublication(
  journal: AssetReadyJournal,
  input: PreparedImageWorkspaceInput,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ImageWorkspacePublicationResult> {
  const sourceRef = input.refs.find((ref) => ref.assetId === input.document.sourceImage.assetId);
  if (!sourceRef) throw new Error('Image workspace source ref is missing.');
  const prepared =
    input.expectedRevision === 0 && input.original === undefined && input.newOriginal === undefined
      ? await (async () => {
          const originalBlob = await readAssetFile(sourceRef, input.document.sourceName ?? 'image');
          return { originalBlob, thumbnailBlob: await createImageThumbnailBlob(originalBlob) };
        })()
      : null;
  return runWithIndexedDbMutation((mutationDb) =>
    commitImageWorkspaceMutation(
      mutationDb,
      { ...input, publicationId: journal.journalId },
      prepared,
      lifecyclePermit
    )
  );
}

export const imageWorkspacePublicationAdapter: AssetPublicationAdapter = {
  domain: IMAGE_WORKSPACE_PUBLICATION_DOMAIN,
  publish: async (journal, permit) => {
    const result = await publishImageWorkspaceJournal(journal, true, permit);
    return result === 'defer' ? 'defer' : undefined;
  },
};

export function recoverImageWorkspacePublications(): Promise<number> {
  return recoverStandaloneAssetPublications([imageWorkspacePublicationAdapter]);
}

export async function commitImagePresentation(input: CommitImagePresentationInput): Promise<void> {
  await runWithIndexedDbMutation(async (db, permit) => {
    const tx = db.transaction(IMAGE_SNAPSHOT_STORES, 'readwrite');
    try {
      await assertImageGeneration(tx, input.aggregateId, input.expectedGeneration);
      const media = parseMediaLibraryEntry(
        await tx.objectStore(MEDIA_LIBRARY_STORE).get(input.aggregateId)
      );
      const linked = media
        ? null
        : parseImageWorkspaceEntry(
            await tx.objectStore(IMAGE_WORKSPACES_STORE).get(input.aggregateId)
          );
      if (!media && !linked?.sourceMediaId)
        throw new ImageAggregateNotFoundError(input.aggregateId);
      if (linked?.lifecycle?.trashedAt !== undefined)
        throw new StaleImageWorkspaceError(input.aggregateId);
      if ((media?.workspaceRevision ?? linked?.revision ?? 0) !== input.expectedWorkspaceRevision) {
        throw new StaleImageWorkspaceError(input.aggregateId);
      }
      const entry = {
        aggregateId: input.aggregateId,
        aggregateKind: 'image' as const,
        presentationRevision: input.expectedWorkspaceRevision,
        previewBlob: input.previewBlob,
        thumbnailBlob: input.thumbnailBlob,
        updatedAt: Date.now(),
      };
      if (linked) {
        await commitImagePresentationCacheInTransaction(tx, entry, permit, 'image-project');
      } else if (media && isImageCaptureSource(media)) {
        await commitImagePresentationCacheInTransaction(tx, entry, permit);
      } else {
        await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).put(entry);
      }
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

export async function promoteImageAggregate(
  aggregateId: string,
  expectedWorkspaceRevision: number,
  expectedGeneration?: string | null
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(IMAGE_SNAPSHOT_STORES, 'readwrite');
    try {
      await assertImageGeneration(tx, aggregateId, expectedGeneration);
      const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
      const media = parseMediaLibraryEntry(await mediaStore.get(aggregateId));
      const project = media
        ? null
        : parseImageWorkspaceEntry(await tx.objectStore(IMAGE_WORKSPACES_STORE).get(aggregateId));
      if (!media && !project?.sourceMediaId) throw new ImageAggregateNotFoundError(aggregateId);
      if (project?.lifecycle?.trashedAt !== undefined)
        throw new StaleImageWorkspaceError(aggregateId);
      if ((media?.workspaceRevision ?? project?.revision ?? 0) !== expectedWorkspaceRevision) {
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
      if (media?.lifecycle?.storageClass === 'temporary') {
        await mediaStore.put({
          ...media,
          lifecycle: promoteLibraryLifecycle(media.lifecycle),
        });
        if (media.source.kind === 'screenshot' || media.source.kind === 'stored-asset')
          await captureImageInTransaction(tx, aggregateId);
      }
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}

export async function deleteImageWorkspaceProject(
  aggregateId: string,
  expectedRevision: number,
  expectedLifecycleUpdatedAt: number
): Promise<string> {
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const sourceId = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        IMAGE_WORKSPACES_STORE,
        IMAGE_WORKSPACE_IDENTITIES_STORE,
        MEDIA_LIBRARY_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
        SYNC_CAPTURE_STORE,
      ],
      'readwrite'
    );
    try {
      const store = tx.objectStore(IMAGE_WORKSPACES_STORE);
      const project = parseImageWorkspaceEntry(await store.get(aggregateId));
      if (
        !project?.sourceMediaId ||
        project.aggregateId !== aggregateId ||
        project.revision !== expectedRevision ||
        project.lifecycle?.updatedAt !== expectedLifecycleUpdatedAt ||
        (await tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId)) !== undefined
      )
        throw new StaleImageWorkspaceError(aggregateId);
      await retireImageWorkspaceIdentity(tx, aggregateId, project.revision);
      await removeEditorDocumentOwnership({
        document: { assets: imageWorkspaceAssetBindings(project) },
        ownerId: aggregateId,
        ownerKind: IMAGE_WORKSPACE_OWNER_KIND,
        physicalDelete,
        stores: {
          owners: tx.objectStore(ASSET_OWNERS_STORE),
          refs: tx.objectStore(ASSET_REFS_STORE),
        },
      });
      await store.delete(aggregateId);
      await captureDeletionInTransaction(
        tx,
        'image-project',
        aggregateId,
        'local-edit',
        project.revision
      );
      await tx
        .objectStore(AGGREGATE_PRESENTATIONS_STORE)
        .delete(createAggregatePresentationKey({ id: aggregateId, kind: 'image' }));
      if (physicalDelete.assetIds.length > 0)
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      await tx.done;
      return project.sourceMediaId;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
  return sourceId;
}

function assertEditableImageRoot(
  aggregateId: string,
  media: MediaLibraryEntry | undefined,
  blob: Blob | undefined
): MediaLibraryEntry & { blob: Blob } {
  if (!media || !isEditableImageAggregateRoot(media) || !(blob instanceof Blob)) {
    throw new ImageAggregateNotFoundError(aggregateId);
  }
  return { ...media, blob };
}

export async function restoreImageAggregateOriginal(
  aggregateId: string,
  expectedWorkspaceRevision: number,
  expectedGeneration?: string | null,
  sourceMediaId?: string
): Promise<{ revision: number; updatedAt: number }> {
  const project = await readImageOriginalSource(
    aggregateId,
    sourceMediaId === undefined ? {} : { includeBlob: false }
  );
  if (
    (sourceMediaId !== undefined && project.sourceMediaId !== sourceMediaId) ||
    (expectedGeneration !== undefined && project.sourceGeneration !== expectedGeneration)
  )
    throw new StaleImageWorkspaceError(aggregateId);
  const original =
    sourceMediaId === undefined ? project : await readImageOriginalSource(sourceMediaId);
  const source = assertEditableImageRoot(aggregateId, original.asset, original.blob);
  const [document, thumbnailBlob] = await Promise.all([
    createOriginalImageDocument(source),
    createImageThumbnailBlob(source.blob),
  ]);
  const result = await commitImageWorkspace({
    aggregateId,
    document,
    expectedRevision: expectedWorkspaceRevision,
    expectedGeneration: project.sourceGeneration,
    ...(sourceMediaId === undefined
      ? {}
      : {
          original: { mediaId: sourceMediaId, generation: original.sourceGeneration },
          requireExistingRoot: true,
        }),
    history: null,
    imageContentState: 'original',
    sourceFavicon: source.sourceFavicon,
    sourceTitle: source.sourceTitle,
    sourceUrl: source.sourceUrl,
  });
  await commitImagePresentation({
    aggregateId,
    expectedWorkspaceRevision: result.revision,
    expectedGeneration: result.sourceGeneration ?? null,
    previewBlob: source.blob,
    thumbnailBlob,
  });
  return { revision: result.revision, updatedAt: result.updatedAt };
}

export async function copyImageAggregate(input: {
  aggregateId: string;
  expectedWorkspaceRevision: number;
  targetAggregateId: string;
}): Promise<string> {
  await recoverImageWorkspacePublications();
  const original = await readImageOriginalSource(input.aggregateId);
  const sourceMedia = assertEditableImageRoot(input.aggregateId, original.asset, original.blob);
  const sourcePresentation = await getAggregatePresentation({
    id: input.aggregateId,
    kind: 'image',
  });
  const sourceWorkspace = await readImageWorkspace(input.aggregateId, { includeHistory: false });
  try {
    if (sourceWorkspace && (sourceWorkspace.sourceGeneration ?? null) !== original.sourceGeneration)
      throw new StaleImageWorkspaceError(input.aggregateId);
    const originalOnly =
      !sourceWorkspace && !sourcePresentation && sourceMedia.imageContentState === 'original';
    if (
      (sourceMedia.workspaceRevision ?? 0) !== input.expectedWorkspaceRevision ||
      (sourceWorkspace && sourceWorkspace.revision !== input.expectedWorkspaceRevision) ||
      (!originalOnly &&
        sourcePresentation?.presentationRevision !== input.expectedWorkspaceRevision)
    ) {
      throw new ImagePresentationNotCurrentError(input.aggregateId);
    }
    const [document, thumbnailBlob] = await Promise.all([
      sourceWorkspace?.document ?? createOriginalImageDocument(sourceMedia),
      sourcePresentation?.thumbnailBlob ?? createImageThumbnailBlob(sourceMedia.blob),
    ]);
    const retainedOriginalId = original.sourceMediaId ?? input.aggregateId;
    const retainedOriginal = original.sourceMediaId
      ? await readImageOriginalSource(retainedOriginalId, { includeBlob: false })
      : original;
    const copy = await saveImageAggregateCopyFromDocument({
      document,
      original: { mediaId: retainedOriginalId, generation: retainedOriginal.sourceGeneration },
      previewBlob: sourcePresentation?.previewBlob ?? sourceMedia.blob,
      sourceFavicon: sourceMedia.sourceFavicon,
      sourceTitle: sourceWorkspace?.sourceTitle ?? sourceMedia.sourceTitle,
      sourceUrl: sourceWorkspace?.sourceUrl ?? sourceMedia.sourceUrl,
      targetAggregateId: input.targetAggregateId,
      thumbnailBlob,
      sourceGuard: {
        aggregateId: input.aggregateId,
        ...(sourcePresentation
          ? { presentationRevision: sourcePresentation.presentationRevision }
          : {}),
        workspaceRevision: input.expectedWorkspaceRevision,
        sourceGeneration: original.sourceGeneration,
      },
    });
    return copy.aggregateId;
  } finally {
    sourceWorkspace?.releaseDocumentAssets?.();
  }
}

export async function saveImageAggregateCopyFromDocument(
  input: SaveImageAggregateCopyFromDocumentInput
): Promise<ImageAggregateCopyResult> {
  const result = await commitImageWorkspace({
    aggregateId: input.targetAggregateId,
    document: input.document,
    ...(input.history ? { history: input.history } : {}),
    expectedRevision: 0,
    ...(input.original
      ? { original: input.original }
      : {
          newOriginal: {
            mediaId: crypto.randomUUID(),
            filename: input.document.sourceName?.trim() || 'Image copy',
            width: input.document.sourceWidth,
            height: input.document.sourceHeight,
            dataUrl: input.document.sourceImageData,
          },
        }),
    requireMissingRoot: true,
    ...(input.sourceFavicon === undefined ? {} : { sourceFavicon: input.sourceFavicon }),
    ...(input.sourceTitle === undefined ? {} : { sourceTitle: input.sourceTitle }),
    ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl }),
    ...(input.sourceGuard ? { sourceGuard: input.sourceGuard } : {}),
  });
  await commitImagePresentation({
    aggregateId: input.targetAggregateId,
    expectedWorkspaceRevision: result.revision,
    expectedGeneration: result.sourceGeneration ?? null,
    previewBlob: input.previewBlob,
    thumbnailBlob: input.thumbnailBlob,
  });
  return { ...result, aggregateId: input.targetAggregateId };
}
