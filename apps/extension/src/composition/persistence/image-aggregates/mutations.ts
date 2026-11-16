import type {
  CommitImageWorkspaceInput,
  CommitImageWorkspaceResult,
  CommitImagePresentationInput,
  SaveImageAggregateCopyFromDocumentInput,
  ImageWorkspacePublicationResult,
  ImageAggregateCopyResult,
} from './contracts';
import { freezeImageInTransaction, isImageCaptureSource } from '../sync-capture/image-snapshot';
import { commitImagePresentationCacheInTransaction } from '../sync-capture/presentation';
import { ASSET_RESIDENCY_STORE } from '../infrastructure/indexed-db/core.stores';
import { captureCheckpointReceiptInTransaction } from '../sync-capture/checkpoints';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  captureImageInTransaction,
  captureMediaInTransaction,
  readImageRevisionFence,
} from '../sync-capture/capture';
import { SYNC_CAPTURE_STORE } from '../infrastructure/indexed-db/core.stores';
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
];

interface PreparedImageWorkspaceInput extends Omit<
  CommitImageWorkspaceInput,
  | 'document'
  | 'history'
  | 'reusableHistoryAssetsByValue'
  | 'reusableAssetsByRuntimeUrl'
  | 'reusableAssetsByVectorDefinitionId'
> {
  document: PersistedEditorDocument;
  history?: PersistedImageHistory | null;
  initialStorageClass?: 'temporary' | 'library';
  refs: AssetRef[];
  publicationId?: string;
  originalWitness?: { createdAt: number; ref: AssetRef; projectAsset: StoredProjectAssetEntry };
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
    if (input.sourceGuard) {
      await assertImageGeneration(
        tx,
        input.sourceGuard.aggregateId,
        input.sourceGuard.sourceGeneration
      );
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
        (guardedWorkspace?.revision ?? guardedMedia.workspaceRevision ?? 0) !==
          input.sourceGuard.workspaceRevision
      ) {
        throw new StaleImageWorkspaceError(input.sourceGuard.aggregateId);
      }
      if (guardedPresentation?.presentationRevision !== input.sourceGuard.presentationRevision) {
        throw new ImagePresentationNotCurrentError(input.sourceGuard.aggregateId);
      }
    }
    const rootWasMissing = (await mediaStore.get(input.aggregateId)) === undefined;
    const identity = await readImageWorkspaceIdentity(tx, input.aggregateId);
    if (
      identity?.retired ||
      (rootWasMissing && (identity !== null || (input.expectedGeneration ?? null) !== null)) ||
      (!rootWasMissing && (identity?.generation ?? null) !== (input.expectedGeneration ?? null))
    )
      throw new StaleImageWorkspaceError(input.aggregateId);
    if (rootWasMissing && (await readImageRevisionFence(tx, input.aggregateId)) !== null)
      throw new ImageAggregateCollisionError(input.aggregateId);
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
    const generation = rootWasMissing
      ? await createImageWorkspaceIdentity(tx, input.aggregateId)
      : identity?.generation;
    if ((media.workspaceRevision ?? 0) !== input.expectedRevision) {
      throw new StaleImageWorkspaceError(input.aggregateId);
    }

    if (input.originalWitness) {
      const current = await freezeImageInTransaction(tx, input.aggregateId);
      if (
        current.media.createdAt !== input.originalWitness.createdAt ||
        JSON.stringify(current.originalRef) !== JSON.stringify(input.originalWitness.ref) ||
        JSON.stringify(current.projectAsset) !== JSON.stringify(input.originalWitness.projectAsset)
      )
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
    const revision = input.expectedRevision + 1;
    if (!Number.isSafeInteger(revision)) throw new StaleImageWorkspaceError(input.aggregateId);
    await workspaceStore.put({
      aggregateId: input.aggregateId,
      createdAt: existing?.createdAt ?? media.createdAt,
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
    await mediaStore.put({
      ...media,
      imageContentState: input.imageContentState ?? 'edited',
      updatedAt: now,
      workspaceRevision: revision,
      lifecycle: media.lifecycle
        ? promoteLibraryLifecycle({ ...media.lifecycle, updatedAt: now }, now)
        : createLibraryLifecycle('library', now),
    });
    const acceptedRoot = parseMediaLibraryEntry(await mediaStore.get(input.aggregateId));
    const checkpointReceipt =
      acceptedRoot && isImageCaptureSource(acceptedRoot)
        ? await captureCheckpointReceiptInTransaction(
            tx,
            { rootKind: 'media', rootId: input.aggregateId },
            () =>
              captureMediaInTransaction(
                tx,
                input.aggregateId,
                input.publicationId === undefined ? {} : { publicationId: input.publicationId }
              )
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

/** Reuse only the exact immutable original already owned by this imported Image. */
async function prepareImportedOriginalReuse(
  db: ImageMutationDatabase,
  input: CommitImageWorkspaceInput
): Promise<PreparedImageWorkspaceInput['originalWitness'] | undefined> {
  if (
    input.requireMissingRoot ||
    !input.document.sourceImageData.startsWith('data:') ||
    input.reusableAssetsByRuntimeUrl?.has(input.document.sourceImageData)
  )
    return undefined;
  const media = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, input.aggregateId));
  if (!media || media.source.kind !== 'project-asset' || !isImageCaptureSource(media))
    return undefined;
  const tx = db.transaction(IMAGE_SNAPSHOT_STORES, 'readonly');
  const rows = await freezeImageInTransaction(tx, input.aggregateId);
  await tx.done;
  if (!rows.originalRef || !rows.projectAsset)
    throw new ImageAggregateCollisionError(input.aggregateId);
  const original = await readAssetFile(rows.originalRef, rows.media.filename);
  const source = await dataUrlToBlob(input.document.sourceImageData);
  if (original.type !== source.type || original.size !== source.size) return undefined;
  const [originalBytes, sourceBytes] = await Promise.all([
    original.arrayBuffer(),
    source.arrayBuffer(),
  ]);
  const bytes = new Uint8Array(sourceBytes);
  if (!new Uint8Array(originalBytes).every((byte, index) => byte === bytes[index]))
    return undefined;
  return {
    createdAt: rows.media.createdAt,
    ref: rows.originalRef,
    projectAsset: rows.projectAsset,
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
    execution = (async () => {
      const prepared = publish ?? (await prepareImageWorkspaceCommit(input));
      publish = prepared;
      return prepared();
    })();
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
  // Cold database admission reserves the exclusive transition gate; it must settle before
  // staged assets hold shared transition leases or admission could queue behind them.
  const db = await initDB();
  await recoverImageWorkspacePublications();
  const originalWitness = await prepareImportedOriginalReuse(db, input);
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
    reusableHistoryAssetsByValue: _reusableHistoryAssetsByValue,
    reusableAssetsByRuntimeUrl: _reusableAssetsByRuntimeUrl,
    reusableAssetsByVectorDefinitionId: _reusableAssetsByVectorDefinitionId,
    ...serializableInput
  } = input;
  const preparedObjects = [...preparedDocument.objects];
  let journalCreated = false;
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
    const refs = [
      ...new Map(
        [...preparedDocument.refs, ...(preparedHistory?.refs ?? [])].map((ref) => [
          ref.assetId,
          ref,
        ])
      ).values(),
    ];
    const preparedInput: PreparedImageWorkspaceInput = {
      ...serializableInput,
      expectedGeneration: input.expectedGeneration ?? null,
      document: preparedDocument.document,
      ...(input.history === undefined ? {} : { history: preparedHistory?.history ?? null }),
      refs,
      ...(originalWitness ? { originalWitness } : {}),
    };
    const journal = await createAssetPublicationJournal({
      assetRefs: preparedObjects.map(({ ref }) => ref),
      domain: IMAGE_WORKSPACE_PUBLICATION_DOMAIN,
      payload: preparedInput,
    });
    journalCreated = true;
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
    if (!journalCreated) {
      const failures = await collectPreparedAssetCleanupFailures(
        preparedObjects.map(({ ref }) => ref.assetId)
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
  const rawOriginalWitness = value['originalWitness'];
  const witnessRef = isRecord(rawOriginalWitness) ? parseAssetRef(rawOriginalWitness['ref']) : null;
  const witnessChild = isRecord(rawOriginalWitness)
    ? parseProjectAssetEntry(rawOriginalWitness['projectAsset'])
    : null;
  let originalWitness: PreparedImageWorkspaceInput['originalWitness'];
  if (rawOriginalWitness !== undefined) {
    if (
      !isRecord(rawOriginalWitness) ||
      typeof rawOriginalWitness['createdAt'] !== 'number' ||
      !Number.isFinite(rawOriginalWitness['createdAt']) ||
      !witnessRef ||
      !witnessChild ||
      witnessChild.assetId !== witnessRef.assetId ||
      witnessChild.size !== witnessRef.size ||
      witnessChild.mimeType !== witnessRef.mimeType ||
      witnessChild.originMediaId !== undefined ||
      value['aggregateId'] !== `project-asset:${witnessChild.id}` ||
      document.sourceImage.assetId !== witnessRef.assetId ||
      !refs.some((ref) => ref && JSON.stringify(ref) === JSON.stringify(witnessRef))
    )
      return null;
    originalWitness = {
      createdAt: rawOriginalWitness['createdAt'],
      ref: witnessRef,
      projectAsset: witnessChild,
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
      !Number.isInteger(sourceGuard.presentationRevision) ||
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

async function publishImageWorkspaceJournal(
  journal: AssetReadyJournal,
  allowSuperseded = false,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ImageWorkspacePublicationResult | null | 'defer'> {
  if (journal.domain !== IMAGE_WORKSPACE_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid image workspace publication journal.');
  }
  const input = parseImageWorkspacePublicationPayload(journal.payload);
  if (!input) throw new Error('Invalid image workspace publication payload.');
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
  return commitPreparedImageWorkspacePublication(journal, input, lifecyclePermit);
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
  if (
    journal.domain !== IMAGE_WORKSPACE_PUBLICATION_DOMAIN ||
    journal.operationId ||
    refIds.size !== input.refs.length ||
    journal.assetRefs.some((journalRef) => !refIds.has(journalRef.assetId)) ||
    bindings.some((asset) => !refIds.has(asset.assetId))
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
  const [rawMedia, rawWorkspace, rawPresentation, identity] = await Promise.all([
    mediaRead,
    workspaceRead,
    presentationRead,
    readImageWorkspaceIdentity(snapshot, input.aggregateId),
  ]);
  await snapshot.done;
  const existing = parseImageWorkspaceEntry(rawWorkspace);
  const sameGeneration =
    !identity?.retired && (identity?.generation ?? null) === (input.expectedGeneration ?? null);
  const ownPublication = existing?.publicationId === journal.journalId;
  if (
    (!input.requireMissingRoot || ownPublication) &&
    !identity?.retired &&
    (sameGeneration || ownPublication) &&
    rawMedia !== undefined &&
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
    input.expectedGeneration === undefined &&
    !input.requireExistingRoot &&
    rawMedia === undefined &&
    rawWorkspace === undefined &&
    rawPresentation === undefined &&
    identity === null
  )
    return { kind: 'deferred' };
  const existingMedia = parseMediaLibraryEntry(rawMedia);
  const occupiedSidecar = rawWorkspace !== undefined || rawPresentation !== undefined;
  const incompatibleRoot =
    rawMedia !== undefined && (!existingMedia || !isEditableImageAggregateRoot(existingMedia));
  const permanentlySuperseded = input.requireMissingRoot
    ? rawMedia !== undefined || occupiedSidecar || !sameGeneration
    : !sameGeneration ||
      (input.requireExistingRoot === true && rawMedia === undefined) ||
      incompatibleRoot ||
      (rawMedia === undefined && occupiedSidecar) ||
      (rawWorkspace !== undefined && !parseImageWorkspaceEntry(rawWorkspace)) ||
      (existingMedia?.workspaceRevision ?? 0) !== input.expectedRevision;
  if (allowSuperseded && permanentlySuperseded) {
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
      if ((ref !== undefined) !== isOwnedByThisWorkspace) {
        throw new StaleImageWorkspaceError(input.aggregateId);
      }
      if (!isOwnedByThisWorkspace) unownedStagedAssetIds.add(stagedRef.assetId);
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
    input.expectedRevision === 0
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
    const tx = db.transaction([...IMAGE_SNAPSHOT_STORES, ASSET_RESIDENCY_STORE], 'readwrite');
    try {
      await assertImageGeneration(tx, input.aggregateId, input.expectedGeneration);
      const media = parseMediaLibraryEntry(
        await tx.objectStore(MEDIA_LIBRARY_STORE).get(input.aggregateId)
      );
      if (!media) throw new ImageAggregateNotFoundError(input.aggregateId);
      if ((media.workspaceRevision ?? 0) !== input.expectedWorkspaceRevision) {
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
      if (isImageCaptureSource(media)) {
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
        if (media.source.kind === 'screenshot' || media.source.kind === 'stored-asset')
          await captureImageInTransaction(tx, aggregateId);
      }
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
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

export async function restoreImageAggregateOriginal(
  aggregateId: string,
  expectedWorkspaceRevision: number,
  expectedGeneration?: string | null
): Promise<{ revision: number; updatedAt: number }> {
  const original = await readImageOriginalSource(aggregateId);
  if (expectedGeneration !== undefined && original.sourceGeneration !== expectedGeneration)
    throw new StaleImageWorkspaceError(aggregateId);
  const source = assertEditableImageRoot(aggregateId, original.asset ?? null);
  const [document, thumbnailBlob] = await Promise.all([
    createOriginalImageDocument(source),
    createImageThumbnailBlob(source.blob),
  ]);
  const result = await commitImageWorkspace({
    aggregateId,
    document,
    expectedRevision: expectedWorkspaceRevision,
    expectedGeneration: original.sourceGeneration,
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
  const sourceMedia = assertEditableImageRoot(input.aggregateId, original.asset ?? null);
  const sourcePresentation = await getAggregatePresentation({
    id: input.aggregateId,
    kind: 'image',
  });
  const sourceWorkspace = await readImageWorkspace(input.aggregateId, { includeHistory: false });
  try {
    if (sourceWorkspace && (sourceWorkspace.sourceGeneration ?? null) !== original.sourceGeneration)
      throw new StaleImageWorkspaceError(input.aggregateId);
    if (
      (sourceMedia.workspaceRevision ?? 0) !== input.expectedWorkspaceRevision ||
      (sourceWorkspace && sourceWorkspace.revision !== input.expectedWorkspaceRevision) ||
      !sourcePresentation ||
      sourcePresentation.presentationRevision !== input.expectedWorkspaceRevision
    ) {
      throw new ImagePresentationNotCurrentError(input.aggregateId);
    }
    const document = sourceWorkspace?.document ?? (await createOriginalImageDocument(sourceMedia));
    const copy = await saveImageAggregateCopyFromDocument({
      document,
      ...(sourceMedia.imageContentState === undefined
        ? {}
        : { imageContentState: sourceMedia.imageContentState }),
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
    ...(input.imageContentState === undefined
      ? {}
      : { imageContentState: input.imageContentState }),
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
  await promoteImageAggregate(
    input.targetAggregateId,
    result.revision,
    result.sourceGeneration ?? null
  );
  return { ...result, aggregateId: input.targetAggregateId };
}
