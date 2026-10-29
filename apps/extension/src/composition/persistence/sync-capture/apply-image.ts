import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { assertStandaloneMediaSourceReplaceable } from '../projects/source-admission';
import { initDB } from '../infrastructure/indexed-db/core';
import type {
  DurableAssetLifecyclePermit,
  PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../assets/contracts';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  readAssetFile,
} from '../assets';
import { assetResidencyCopyId } from '../assets/residency-records';
import {
  readAssetResidencyCopyInTransaction,
  retireAssetResidencyCopyInTransaction,
} from '../assets/residency';
import { parseAssetRef } from '../assets/guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { publishPreparedMediaSourceInTransaction } from '../media-library/source-publication';
import { releaseMediaSource } from '../media-library/delete-cascade.sources';
import type { StoredImageWorkspaceEntry } from '../image-workspaces/contracts';
import { parseImageWorkspaceEntry } from '../image-workspaces/parser';
import { putImageWorkspaceBackupRestore } from '../image-workspaces/backup-restore';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import { putAggregatePresentationBackupRestore } from '../aggregate-presentations/backup-restore';
import { removeEditorDocumentOwnership } from '../document-assets';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_RESIDENCY_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  captureRootKey,
  MAX_CAPTURE_ROWS,
  type SyncCaptureRootState,
  type SyncCaptureProfile,
  type CapturedImageRows,
  type SyncCaptureAppliedOperation,
} from './contracts';
import { parseSyncCaptureRecord } from './guards';
import {
  freezeImageInTransaction,
  digestCapturedImageRows,
  isBoundedImageMetadata,
  readImageReplicaPredecessorInTransaction,
} from './image-snapshot';

/** Native JSON plus staged immutable refs; portable codecs remain in the workflow owner. */
export interface ApplyPreparedImageReplicaInput {
  operationId: string;
  sourceDigest: string;
  authorization?: SyncConnectionIdentity;
  spaceId: string;
  profileCreatedAt: number;
  connectionGeneration: number;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedNativeRevision: number | null;
  media: Omit<MediaLibraryEntry, 'blob'>;
  originalRef: AssetRef;
  workspace: StoredImageWorkspaceEntry | null;
  documentRefs: AssetRef[];
  presentation: null | {
    entry: Omit<AggregatePresentationEntry, 'previewBlob' | 'thumbnailBlob'>;
    thumbnailRef: AssetRef;
    previewRef?: AssetRef;
  };
}

type ImageTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;
type ImageReplicaIdentity = Pick<
  ApplyPreparedImageReplicaInput,
  | 'operationId'
  | 'sourceDigest'
  | 'authorization'
  | 'spaceId'
  | 'profileCreatedAt'
  | 'connectionGeneration'
  | 'expectedBasis'
  | 'expectedLocalGeneration'
  | 'expectedNativeRevision'
>;
interface ImageReplicaKeys {
  rootKey: string;
  stateKey: string;
  receiptKey: string;
}
interface HydratedImageReplica {
  originalBlob: Blob;
  presentation: AggregatePresentationEntry | null;
  unchangedOriginalDigest: string | null;
}
type ImageDeleteOperation = ReturnType<typeof buildPhysicalDeleteOperation>;

function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
function refuseImageReplica(): never {
  throw new Error('Image replica predecessor changed.');
}

function parseImageReplicaIdentity(value: Record<string, unknown>): ImageReplicaIdentity | null {
  const authorization =
    value['authorization'] === undefined
      ? undefined
      : parseSyncConnectionIdentity(value['authorization']);
  if (
    authorization === null ||
    !identity(value['operationId']) ||
    !identity(value['spaceId']) ||
    typeof value['sourceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sourceDigest']) ||
    !ordinal(value['profileCreatedAt']) ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] < 1 ||
    !ordinal(value['expectedLocalGeneration']) ||
    (value['expectedNativeRevision'] !== null && !ordinal(value['expectedNativeRevision'])) ||
    !Array.isArray(value['expectedBasis']) ||
    value['expectedBasis'].length !== (value['expectedLocalGeneration'] === 0 ? 0 : 1) ||
    !value['expectedBasis'].every(identity)
  )
    return null;
  return {
    ...(authorization !== undefined ? { authorization } : {}),
    operationId: value['operationId'],
    sourceDigest: value['sourceDigest'],
    spaceId: value['spaceId'],
    profileCreatedAt: value['profileCreatedAt'],
    connectionGeneration: value['connectionGeneration'],
    expectedBasis: value['expectedBasis'],
    expectedLocalGeneration: value['expectedLocalGeneration'],
    expectedNativeRevision: value['expectedNativeRevision'],
  };
}

function parseImageReplicaSource(value: Record<string, unknown>) {
  const media = parseMediaLibraryEntry(value['media']);
  const originalRef = parseAssetRef(value['originalRef']);
  if (
    !media ||
    media.blob !== undefined ||
    (media.source.kind !== 'screenshot' && media.source.kind !== 'stored-asset') ||
    !['image', 'screenshot'].includes(media.kind) ||
    media.lifecycle?.storageClass !== 'library' ||
    media.recordingMetadata ||
    media.recordingGroup ||
    !ordinal(media.workspaceRevision) ||
    !originalRef ||
    originalRef.size !== media.size ||
    originalRef.mimeType !== media.mimeType ||
    (media.source.kind === 'stored-asset' && media.source.assetId !== originalRef.assetId)
  )
    return null;
  return { media, originalRef };
}

function parseImageReplicaDocument(value: Record<string, unknown>, media: MediaLibraryEntry) {
  const workspace =
    value['workspace'] === null ? null : parseImageWorkspaceEntry(value['workspace']);
  const rawRefs = value['documentRefs'];
  if (
    (value['workspace'] !== null && !workspace) ||
    !Array.isArray(rawRefs) ||
    rawRefs.length > MAX_CAPTURE_ROWS
  )
    return null;
  const refs = rawRefs.map(parseAssetRef);
  if (refs.some((ref) => ref === null)) return null;
  const documentRefs = refs.filter((ref) => ref !== null);
  const ids = new Set(documentRefs.map((ref) => ref.assetId));
  const needed = new Set(workspace?.document.assets.map((asset) => asset.assetId) ?? []);
  if (
    ids.size !== documentRefs.length ||
    ids.size !== needed.size ||
    [...needed].some((id) => !ids.has(id)) ||
    (workspace &&
      (workspace.aggregateId !== media.id ||
        workspace.revision !== media.workspaceRevision ||
        !ordinal(workspace.revision)))
  )
    return null;
  return { workspace, documentRefs };
}

function parseImageReplicaPresentation(
  value: unknown,
  media: MediaLibraryEntry
): ApplyPreparedImageReplicaInput['presentation'] | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isRecord(value['entry']) ||
    'previewBlob' in value['entry'] ||
    'thumbnailBlob' in value['entry']
  )
    return undefined;
  const entry = parseAggregatePresentationEntry({ ...value['entry'], thumbnailBlob: new Blob() });
  const thumbnailRef = parseAssetRef(value['thumbnailRef']);
  const previewRef =
    value['previewRef'] === undefined ? undefined : parseAssetRef(value['previewRef']);
  if (
    !entry ||
    entry.aggregateKind !== 'image' ||
    entry.aggregateId !== media.id ||
    !ordinal(entry.presentationRevision) ||
    entry.presentationRevision > (media.workspaceRevision ?? 0) ||
    !thumbnailRef ||
    previewRef === null
  )
    return undefined;
  const { thumbnailBlob: _thumbnail, ...metadata } = entry;
  return { entry: metadata, thumbnailRef, ...(previewRef ? { previewRef } : {}) };
}

function hasConsistentImageRefBindings(input: ApplyPreparedImageReplicaInput): boolean {
  const allRefs = [
    input.originalRef,
    ...input.documentRefs,
    ...(input.presentation
      ? [
          input.presentation.thumbnailRef,
          ...(input.presentation.previewRef ? [input.presentation.previewRef] : []),
        ]
      : []),
  ];
  const unique = new Map<string, string>();
  for (const ref of allRefs) {
    const previous = unique.get(ref.assetId);
    if (previous !== undefined && previous !== JSON.stringify(ref)) return false;
    unique.set(ref.assetId, JSON.stringify(ref));
  }
  return true;
}

/** Parse the native identity, immutable source, document closure and presentation as one journal. */
export function parseApplyPreparedImageReplicaInput(
  value: unknown
): ApplyPreparedImageReplicaInput | null {
  if (!isRecord(value) || !isBoundedImageMetadata(value, false)) return null;
  const allowed = [
    'authorization',
    'operationId',
    'sourceDigest',
    'spaceId',
    'profileCreatedAt',
    'connectionGeneration',
    'expectedBasis',
    'expectedLocalGeneration',
    'expectedNativeRevision',
    'media',
    'originalRef',
    'workspace',
    'documentRefs',
    'presentation',
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  const identity = parseImageReplicaIdentity(value);
  const source = parseImageReplicaSource(value);
  if (!identity || !source) return null;
  const document = parseImageReplicaDocument(value, source.media);
  const presentation = parseImageReplicaPresentation(value['presentation'], source.media);
  if (!document || presentation === undefined) return null;
  const parsed = { ...identity, ...source, ...document, presentation };
  return hasConsistentImageRefBindings(parsed) ? parsed : null;
}

function imageReplicaKeys(input: ApplyPreparedImageReplicaInput): ImageReplicaKeys {
  const rootKey = captureRootKey(input.spaceId, 'media', input.media.id);
  return {
    rootKey,
    stateKey: JSON.stringify(['root-state', rootKey]),
    receiptKey: JSON.stringify(['applied-operation', input.spaceId, input.operationId]),
  };
}

function requireImageReplicaProfile(
  raw: unknown,
  input: ApplyPreparedImageReplicaInput,
  message: string
): SyncCaptureProfile {
  const profile = parseSyncCaptureRecord(raw);
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.spaceId !== input.spaceId ||
    profile.createdAt !== input.profileCreatedAt
  )
    throw new Error(message);
  return profile;
}

function parseImageReplicaReceipt(
  raw: unknown,
  input: ApplyPreparedImageReplicaInput,
  keys: ImageReplicaKeys,
  message: string
): number | null {
  if (raw === undefined) return null;
  const receipt = parseSyncCaptureRecord(raw);
  if (
    !receipt ||
    receipt.kind !== 'applied-operation' ||
    receipt.key !== keys.receiptKey ||
    receipt.spaceId !== input.spaceId ||
    receipt.rootKey !== keys.rootKey ||
    receipt.operationId !== input.operationId ||
    receipt.sourceDigest !== input.sourceDigest
  )
    throw new Error(message);
  return receipt.generation;
}

async function readCompletedImageReceipt(
  input: ApplyPreparedImageReplicaInput
): Promise<number | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const rawProfile: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
  const keys = imageReplicaKeys(input);
  const rawReceipt: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(keys.receiptKey);
  await tx.done;
  requireImageReplicaProfile(rawProfile, input, 'Image replica profile changed.');
  return parseImageReplicaReceipt(rawReceipt, input, keys, 'Image replica receipt differs.');
}

async function detachedBlob(ref: AssetRef, filename: string): Promise<Blob> {
  const file = await readAssetFile(ref, filename);
  if (file.size !== ref.size || file.type !== ref.mimeType)
    throw new Error('Image replica bytes differ from their staged reference.');
  return new Blob([await file.arrayBuffer()], { type: ref.mimeType });
}

async function hashOriginal(blob: Blob): Promise<string> {
  const digest = sha256.create();
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      digest.update(chunk.value);
    }
    return Array.from(digest.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } finally {
    reader.releaseLock();
  }
}

async function checkedImageOriginalDigest(
  input: ApplyPreparedImageReplicaInput,
  original: Blob
): Promise<string | null> {
  if (input.expectedNativeRevision === null) return null;
  const db = await initDB();
  const tx = db.transaction(
    [
      MEDIA_LIBRARY_STORE,
      IMAGE_WORKSPACES_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_RESIDENCY_STORE,
      SYNC_CAPTURE_STORE,
    ],
    'readonly'
  );
  const rootKey = captureRootKey(input.spaceId, 'media', input.media.id);
  const state = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', rootKey]))
  );
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.rootKey !== rootKey ||
    state.generation !== input.expectedLocalGeneration ||
    JSON.stringify(state.basis) !== JSON.stringify(input.expectedBasis)
  )
    refuseImageReplica();
  const predecessor = await readImageReplicaPredecessorInTransaction(tx, input.media.id, state);
  const previous = predecessor.rows;
  await tx.done;
  if (predecessor.unloadedCopy) {
    if (
      previous.media.workspaceRevision !== input.expectedNativeRevision ||
      previous.media.size !== original.size ||
      previous.media.mimeType !== input.media.mimeType
    )
      return null;
    return (await hashOriginal(original)) === predecessor.unloadedCopy.remote.sha256
      ? predecessor.digest
      : null;
  }
  const previousBlob =
    previous.media.blob ??
    (previous.originalRef
      ? await detachedBlob(previous.originalRef, previous.media.filename)
      : null);
  if (!previousBlob) refuseImageReplica();
  if (
    previous.media.workspaceRevision !== input.expectedNativeRevision ||
    previousBlob.size !== original.size ||
    previousBlob.type !== original.type
  )
    return null;
  // Bind byte equality to the exact metadata predecessor. Commit repeats state and revision checks.
  return (await hashOriginal(previousBlob)) === (await hashOriginal(original))
    ? digestCapturedImageRows(previous)
    : null;
}

async function hydrateImageReplica(
  input: ApplyPreparedImageReplicaInput
): Promise<HydratedImageReplica> {
  const originalBlob = await detachedBlob(input.originalRef, input.media.filename);
  const presentation = input.presentation
    ? {
        ...input.presentation.entry,
        thumbnailBlob: await detachedBlob(input.presentation.thumbnailRef, 'thumbnail'),
        ...(input.presentation.previewRef
          ? { previewBlob: await detachedBlob(input.presentation.previewRef, 'preview') }
          : {}),
      }
    : null;
  const unchangedOriginalDigest = await checkedImageOriginalDigest(input, originalBlob);
  return { originalBlob, presentation, unchangedOriginalDigest };
}

async function readImageReplicaPredecessorState(
  tx: ImageTransaction,
  input: ApplyPreparedImageReplicaInput,
  keys: ImageReplicaKeys
): Promise<SyncCaptureRootState | null> {
  const captures = tx.objectStore(SYNC_CAPTURE_STORE);
  const raw: unknown = await captures.get(keys.stateKey);
  const state = raw === undefined ? null : parseSyncCaptureRecord(raw);
  if (raw !== undefined && (!state || state.kind !== 'root-state')) refuseImageReplica();
  if (
    state &&
    (state.kind !== 'root-state' ||
      state.key !== keys.stateKey ||
      state.rootKey !== keys.rootKey ||
      state.spaceId !== input.spaceId)
  )
    refuseImageReplica();
  if (
    (state?.generation ?? 0) !== input.expectedLocalGeneration ||
    JSON.stringify(state?.basis ?? []) !== JSON.stringify(input.expectedBasis)
  )
    refuseImageReplica();
  for (const raw of await captures.index('rootKey').getAll(keys.rootKey)) {
    const record = parseSyncCaptureRecord(raw);
    if (!record || (record.kind === 'sync-operation' && record.phase !== 'published'))
      refuseImageReplica();
  }
  return state;
}

async function assertImageReplicaSidecars(tx: ImageTransaction, mediaId: string): Promise<void> {
  for (const store of [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE, THUMBNAILS_STORE])
    if ((await tx.objectStore(store).get(mediaId)) !== undefined) refuseImageReplica();
  if (
    (
      await tx
        .objectStore(VIDEO_WORKSPACE_HISTORY_STORE)
        .index('aggregateId')
        .getAllKeys(mediaId, 1)
    ).length
  )
    refuseImageReplica();
  for (const kind of ['video-project', 'scenario'])
    if ((await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get([kind, mediaId])) !== undefined)
      refuseImageReplica();
}

async function admitImageReplicaPredecessor(
  tx: ImageTransaction,
  input: ApplyPreparedImageReplicaInput,
  state: SyncCaptureRootState | null,
  unchangedOriginalDigest: string | null
): Promise<CapturedImageRows | null> {
  await assertImageReplicaSidecars(tx, input.media.id);
  const raw: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(input.media.id);
  const predecessor =
    raw === undefined
      ? null
      : state
        ? await readImageReplicaPredecessorInTransaction(tx, input.media.id, state)
        : null;
  if (raw !== undefined && !predecessor) refuseImageReplica();
  const previous = predecessor?.rows ?? null;
  if (previous) {
    if (
      !state ||
      state.deleted ||
      state.nativeDigest !== predecessor?.digest ||
      previous.media.source.kind !== input.media.source.kind ||
      input.expectedNativeRevision !== previous.media.workspaceRevision
    )
      refuseImageReplica();
    if (
      unchangedOriginalDigest !== predecessor?.digest ||
      (previous.originalRef && previous.originalRef.assetId !== input.originalRef.assetId)
    )
      await assertStandaloneMediaSourceReplaceable(previous.media, tx);
  } else {
    if (
      input.media.source.kind === 'stored-asset' &&
      (await tx
        .objectStore(ASSET_OWNERS_STORE)
        .get(['media-library', input.media.id, 'source'])) !== undefined
    )
      refuseImageReplica();
    if (
      input.expectedNativeRevision !== null ||
      (state && (!state.deleted || state.nativeRevision === undefined))
    )
      refuseImageReplica();
    if (
      (await tx.objectStore(IMAGE_WORKSPACES_STORE).get(input.media.id)) !== undefined ||
      (await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(['image', input.media.id])) !==
        undefined
    )
      refuseImageReplica();
  }
  return previous;
}

function nextImageReplicaRevision(
  state: SyncCaptureRootState | null,
  previous: CapturedImageRows | null
): number {
  const revision =
    Math.max(
      state?.nativeRevision ?? 0,
      previous?.media.workspaceRevision ?? 0,
      previous?.workspace?.revision ?? 0,
      previous?.presentation?.presentationRevision ?? 0
    ) + 1;
  if (!Number.isSafeInteger(revision)) refuseImageReplica();
  return revision;
}

async function assertImageReplicaDocumentRefs(
  tx: ImageTransaction,
  refs: AssetRef[]
): Promise<void> {
  for (const ref of refs) {
    const raw: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
    if (raw !== undefined && JSON.stringify(parseAssetRef(raw)) !== JSON.stringify(ref))
      refuseImageReplica();
  }
}

async function publishImageReplicaNative(
  tx: ImageTransaction,
  input: ApplyPreparedImageReplicaInput,
  hydrated: HydratedImageReplica,
  admission: { previous: CapturedImageRows | null; revision: number },
  operation: ImageDeleteOperation
): Promise<void> {
  if (
    admission.previous?.originalRef &&
    admission.previous.originalRef.assetId !== input.originalRef.assetId
  )
    await releaseMediaSource(tx, admission.previous.media, operation);
  if (admission.previous?.workspace)
    await removeEditorDocumentOwnership({
      document: admission.previous.workspace.document,
      ownerId: input.media.id,
      ownerKind: 'image-workspace',
      physicalDelete: operation,
      stores: {
        owners: tx.objectStore(ASSET_OWNERS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
    });
  await tx.objectStore(IMAGE_WORKSPACES_STORE).delete(input.media.id);
  await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).delete(['image', input.media.id]);
  const media = {
    ...input.media,
    ...(input.media.source.kind === 'screenshot' ? { blob: hydrated.originalBlob } : {}),
    workspaceRevision: admission.revision,
  };
  await publishPreparedMediaSourceInTransaction(
    { media, original: { ref: input.originalRef } },
    {
      media: tx.objectStore(MEDIA_LIBRARY_STORE),
      refs: tx.objectStore(ASSET_REFS_STORE),
      owners: tx.objectStore(ASSET_OWNERS_STORE),
      projectAssets: tx.objectStore(PROJECT_ASSETS_STORE),
      projectExports: tx.objectStore(PROJECT_EXPORTS_STORE),
    }
  );
  if (input.workspace)
    await putImageWorkspaceBackupRestore({
      entry: { ...input.workspace, revision: admission.revision },
      refsByAssetId: new Map(input.documentRefs.map((ref) => [ref.assetId, ref])),
      ownerStore: tx.objectStore(ASSET_OWNERS_STORE),
      refStore: tx.objectStore(ASSET_REFS_STORE),
      workspaceStore: tx.objectStore(IMAGE_WORKSPACES_STORE),
    });
  if (
    hydrated.presentation &&
    hydrated.presentation.presentationRevision === input.media.workspaceRevision
  )
    await putAggregatePresentationBackupRestore({
      entry: { ...hydrated.presentation, presentationRevision: admission.revision },
      store: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
    });
}

async function writeImageReplicaProvenance(
  tx: ImageTransaction,
  input: ApplyPreparedImageReplicaInput,
  keys: ImageReplicaKeys,
  revision: number,
  generation: number
): Promise<void> {
  const accepted = await freezeImageInTransaction(tx, input.media.id);
  const createdAt = Date.now();
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: keys.stateKey,
    createdAt,
    spaceId: input.spaceId,
    rootKind: 'media',
    rootId: input.media.id,
    rootKey: keys.rootKey,
    generation,
    basis: [input.operationId],
    nativeDigest: digestCapturedImageRows(accepted),
    nativeRevision: revision,
  };
  const receipt: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: keys.receiptKey,
    createdAt,
    spaceId: input.spaceId,
    rootKey: keys.rootKey,
    operationId: input.operationId,
    sourceDigest: input.sourceDigest,
    generation,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(receipt)) refuseImageReplica();
  await tx.objectStore(SYNC_CAPTURE_STORE).put(state);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(receipt);
}

async function commitImageReplica(
  tx: ImageTransaction,
  input: ApplyPreparedImageReplicaInput,
  hydrated: HydratedImageReplica,
  operation: ImageDeleteOperation,
  permit: PersistenceMutationPermit
): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  const keys = imageReplicaKeys(input);
  const profile = requireImageReplicaProfile(
    await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'),
    input,
    'Image replica predecessor changed.'
  );
  const rawReceipt: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(keys.receiptKey);
  const receipt = parseImageReplicaReceipt(
    rawReceipt,
    input,
    keys,
    'Image replica predecessor changed.'
  );
  if (receipt !== null) return { status: 'duplicate', generation: receipt };
  if (input.authorization !== undefined)
    await checkSyncConnectionAdmission(tx, input, input.authorization);
  if (!profile.enabled || profile.connectionGeneration !== input.connectionGeneration)
    refuseImageReplica();
  const state = await readImageReplicaPredecessorState(tx, input, keys);
  const previous = await admitImageReplicaPredecessor(
    tx,
    input,
    state,
    hydrated.unchangedOriginalDigest
  );
  const revision = nextImageReplicaRevision(state, previous);
  const generation = input.expectedLocalGeneration + 1;
  if (!Number.isSafeInteger(generation)) refuseImageReplica();
  await assertImageReplicaDocumentRefs(tx, [
    ...input.documentRefs,
    ...(input.media.source.kind === 'stored-asset' ? [input.originalRef] : []),
  ]);
  const previousResidency = await readAssetResidencyCopyInTransaction(
    tx,
    assetResidencyCopyId({ kind: 'inline-image', mediaId: input.media.id })
  );
  await publishImageReplicaNative(tx, input, hydrated, { previous, revision }, operation);
  if (previousResidency) await retireAssetResidencyCopyInTransaction(tx, previousResidency, permit);
  await writeImageReplicaProvenance(tx, input, keys, revision, generation);
  if (operation.assetIds.length) await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
  return { status: 'applied', generation };
}

/** Atomically admit native rows and receipt. Hydration remains outside the IDB transaction. */
export async function applyPreparedImageReplica(
  input: ApplyPreparedImageReplicaInput,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  const parsed = parseApplyPreparedImageReplicaInput(input);
  if (!parsed) throw new Error('Invalid prepared image replica.');
  const candidate = structuredClone(parsed);
  // Completed receipts must remain replayable after transport-only staging is removed.
  const receipt = await readCompletedImageReceipt(candidate);
  if (receipt !== null) return { status: 'duplicate', generation: receipt };
  const hydrated = await hydrateImageReplica(candidate);
  const operation = buildPhysicalDeleteOperation([]);
  const result = await runWithIndexedDbMutation(async (db, permit) => {
    const tx = db.transaction(
      [
        SYNC_CAPTURE_STORE,
        SYNC_CONNECTION_STORE,
        MEDIA_LIBRARY_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        ASSET_OPERATIONS_STORE,
        ASSET_RESIDENCY_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        THUMBNAILS_STORE,
        VIDEO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
      ],
      'readwrite'
    );
    try {
      const accepted = await commitImageReplica(tx, candidate, hydrated, operation, permit);
      await tx.done;
      return accepted;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (operation.assetIds.length) await completePhysicalDeleteOperation(operation, lifecyclePermit);
  return result;
}
