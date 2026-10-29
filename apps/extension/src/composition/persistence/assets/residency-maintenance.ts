import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { IDBPTransaction } from 'idb';
import { initDB } from '../infrastructure/indexed-db/core';
import * as stores from '../infrastructure/indexed-db/core.stores';
import {
  runWithPersistenceMutationTransition,
  isActivePersistenceMutationTransitionPermit,
  type PersistenceMutationTransitionPermit,
  runWithPersistenceMutationPermit,
  runWithDurableAssetLifecycleLock,
  runWithExclusivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseAggregatePresentationEntry } from '../aggregate-presentations/parser';
import { captureRootKey } from '../sync-capture/contracts';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { collectSyncCaptureClaims } from '../sync-capture/claims';
import { collectDurableAssetSnapshot } from './retention-authority';
import { readyJournalClaimsAsset } from './retention-claims';
import { tryAssetResourceCleanup, runWithAssetResourceRead } from './resource-sessions';
import { NATIVE_EDITING_RESOURCE_STORES, collectNativeEditingResources } from './editing-resources';
import {
  deleteAssetObject,
  listReadyJournals,
  listWritingAssetIds,
  runWithAssetObjectLockIfAvailable,
  type AssetOpfsOptions,
} from './opfs-store';
import {
  beginAssetResidencyUnloadInTransaction,
  finishAssetResidencyTransitionInTransaction,
  readAssetResidencyRootsPageInTransaction,
  readAssetResidencyCopyInTransaction,
} from './residency';
import {
  parseAssetRef,
  parseAssetOwner,
  parseBackupAssetOperation,
  parseArchiveRestoreSession,
  parsePhysicalDeleteAssetOperation,
} from './guards';
import { restoreMissingAssetObject } from './opfs-residency';
import type { AssetResidencyUnloadDraft } from './residency';
import {
  assetResidencyCopyId,
  parseAssetResidencyRecord,
  type AssetResidencyCopy,
} from './residency-records';

const TRANSACTION_STORES = [
  ...new Set([
    ...NATIVE_EDITING_RESOURCE_STORES,
    stores.ASSET_RESIDENCY_STORE,
    stores.SYNC_CAPTURE_STORE,
    stores.SYNC_CONNECTION_STORE,
    stores.ASSET_OPERATIONS_STORE,
  ]),
];
type Database = Awaited<ReturnType<typeof initDB>>;

/** A current reader-independent protection defers cache eviction without weakening native admission. */
export class AssetResidencyProtectedError extends Error {}

/** Internal command input. The sync workflow must verify the remote copy against actual local bytes first. */
export interface VerifiedAssetUnload {
  draft: AssetResidencyUnloadDraft;
  expectedRevision: number | null;
  authorization: SyncConnectionIdentity;
  signal?: AbortSignal;
}

function runResidencyTransition<T>(
  options: AssetOpfsOptions,
  operation: (permit: PersistenceMutationTransitionPermit) => Promise<T>
): Promise<T> {
  const permit = options.persistenceTransitionPermit;
  if (permit === undefined) return runWithPersistenceMutationTransition(operation);
  if (!isActivePersistenceMutationTransitionPermit(permit))
    return Promise.reject(new Error('Persistence transition permit is not active.'));
  return operation(permit);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function checkNativeAuthority(
  db: Database,
  copy: AssetResidencyCopy,
  options: AssetOpfsOptions
) {
  if (copy.target.kind === 'inline-image') {
    const id = copy.target.mediaId;
    const journals = await listReadyJournals(options);
    if (
      journals.some(
        (journal) =>
          journal.domain === 'image-workspace' &&
          isRecord(journal.payload) &&
          journal.payload['aggregateId'] === id
      )
    )
      throw new AssetResidencyProtectedError('Asset residency source has unfinished publication.');
    return;
  }
  const ref = copy.target.ref;
  const snapshot = await collectDurableAssetSnapshot(db);
  const owners = snapshot.owners.filter((owner) => owner.assetId === ref.assetId);
  const projected = snapshot.expectedOwners.filter((owner) => owner.assetId === ref.assetId);
  const ownerKey = (owner: (typeof owners)[number]) =>
    JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]);
  if (
    !snapshot.authorityValid ||
    !snapshot.refs.some((value) => same(value, ref)) ||
    owners.length === 0 ||
    owners.length !== projected.length ||
    !owners.every((owner) => projected.some((value) => ownerKey(value) === ownerKey(owner))) ||
    snapshot.protectedRollbackAssetIds.has(ref.assetId)
  ) {
    throw new Error('Asset residency native source is unavailable.');
  }
  const journals = await listReadyJournals(options);
  const writing = await listWritingAssetIds(options);
  if (
    writing.includes(ref.assetId) ||
    journals.some((journal) => readyJournalClaimsAsset(journal, ref.assetId))
  ) {
    throw new AssetResidencyProtectedError('Asset residency source has unfinished publication.');
  }
}

async function commitIntent(
  db: Database,
  copy: AssetResidencyCopy,
  input: VerifiedAssetUnload,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyCopy> {
  const tx = db.transaction(TRANSACTION_STORES, 'readwrite');
  try {
    const metadata = await checkSyncConnectionAdmission(
      tx,
      copy.remote.binding,
      input.authorization
    );
    if (!metadata || !same(metadata.binding, copy.remote.binding))
      throw new Error('Asset residency connection changed.');
    const target = copy.target;
    const raw: unknown[] = await tx.objectStore(stores.SYNC_CAPTURE_STORE).getAll();
    const captures = raw.map(parseSyncCaptureRecord);
    if (captures.some((value) => value === null))
      throw new Error('Asset residency capture authority is invalid.');
    const pending = collectSyncCaptureClaims(
      captures.filter((value) => value?.kind !== 'sync-operation' || value.phase !== 'published')
    );
    const pendingInline =
      target.kind === 'inline-image' &&
      captures.some((capture) => {
        if (!capture || capture.kind !== 'sync-operation' || capture.phase === 'published')
          return false;
        if (capture.rootKind === 'media' && capture.rootId === target.mediaId) return true;
        if (capture.phase !== 'native') return false;
        switch (capture.change.kind) {
          case 'video-project':
          case 'video-review':
          case 'scenario-project':
            return capture.change.rows.media.some((media) => media.id === target.mediaId);
          case 'image':
          case 'media':
            return capture.change.rows.media.id === target.mediaId;
          case 'tombstone':
            return false;
        }
      });
    if (
      !pending.valid ||
      pendingInline ||
      (target.kind === 'opfs' && pending.assetIds.has(target.ref.assetId))
    )
      throw new AssetResidencyProtectedError('Asset residency source has unfinished capture.');
    let cursor: string | undefined;
    do {
      const page = await readAssetResidencyRootsPageInTransaction(tx, cursor);
      for (const root of page.records) {
        if (!root.pinned) continue;
        const rootStore =
          root.rootKind === 'media'
            ? stores.MEDIA_LIBRARY_STORE
            : root.rootKind === 'video-project'
              ? stores.VIDEO_PROJECTS_STORE
              : root.rootKind === 'scenario-project'
                ? stores.SCENARIO_PROJECTS_STORE
                : stores.VIDEO_WORKSPACES_STORE;
        const present =
          (await tx.objectStore(rootStore).get(root.rootId)) !== undefined ||
          (root.rootKind === 'video-review' &&
            (await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(root.rootId)) !== undefined);
        if (!present) continue;
        const resources = await collectNativeEditingResources(tx, root, 'backup');
        if (
          target.kind === 'opfs'
            ? resources.refs.some((value) => value.assetId === target.ref.assetId)
            : resources.inlineMediaIds.includes(target.mediaId)
        )
          throw new AssetResidencyProtectedError('Asset residency source is pinned offline.');
      }
      cursor = page.nextId ?? undefined;
    } while (cursor !== undefined);
    // Completed transport pins do not own original residency. Keep every publication fact.
    if (target.kind === 'opfs') {
      const ref = target.ref;
      for (const capture of captures) {
        if (!capture || capture.kind !== 'sync-operation' || capture.phase !== 'published')
          continue;
        const matching = capture.objects.filter(
          (object) => object.pinned && object.ref.assetId === ref.assetId
        );
        if (
          matching.some((object) => !same(object.ref, ref) || object.sha256 !== copy.remote.sha256)
        )
          throw new Error('Asset residency publication binding changed.');
        if (matching.length)
          await tx.objectStore(stores.SYNC_CAPTURE_STORE).put({
            ...capture,
            objects: capture.objects.map((object) =>
              object.ref.assetId === ref.assetId ? { ...object, pinned: false } : object
            ),
          });
      }
    }
    input.signal?.throwIfAborted();
    const intent = await beginAssetResidencyUnloadInTransaction(
      tx,
      {
        operationId: copy.operationId,
        target: copy.target,
        remote: copy.remote,
        lastUsedAt: copy.lastUsedAt,
      },
      input.expectedRevision,
      permit
    );
    const result =
      target.kind === 'inline-image' ? await unloadInlineInTransaction(tx, intent, permit) : intent;
    input.signal?.throwIfAborted();
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The transaction can already be closed. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/** Remove owned original bytes only; preserve native identity and durable recovery evidence on interruption. */
export async function unloadVerifiedAssetObject(
  input: VerifiedAssetUnload,
  options: AssetOpfsOptions = {}
): Promise<AssetResidencyCopy | 'busy'> {
  const copy = parseAssetResidencyRecord({
    version: 1,
    kind: 'copy',
    id: assetResidencyCopyId(input.draft.target),
    revision: 1,
    phase: 'unloading',
    ...input.draft,
  });
  const authorization = parseSyncConnectionIdentity(input.authorization);
  if (!copy || copy.kind !== 'copy' || !authorization)
    throw new Error('Asset residency unload command is invalid.');
  // Capture the admitted database before any lifecycle wait. Never reacquire it inside maintenance.
  const assetId = copy.target.kind === 'opfs' ? copy.target.ref.assetId : null;
  const command: VerifiedAssetUnload = {
    draft: {
      operationId: copy.operationId,
      target: copy.target,
      remote: copy.remote,
      lastUsedAt: copy.lastUsedAt,
    },
    expectedRevision: input.expectedRevision,
    authorization,
    ...(input.signal ? { signal: input.signal } : {}),
  };
  const db = await initDB();
  return runResidencyTransition(options, (transitionPermit) =>
    runWithDurableAssetLifecycleLock(() =>
      tryAssetResourceCleanup(() =>
        runWithExclusivePersistenceMutationPermit(async (permit) => {
          command.signal?.throwIfAborted();
          if (assetId === null) {
            await checkNativeAuthority(db, copy, options);
            return commitIntent(db, copy, command, permit);
          }
          const result = await runWithAssetObjectLockIfAvailable(
            assetId,
            async () => {
              await checkNativeAuthority(db, copy, options);
              const intent = await commitIntent(db, copy, command, permit);
              if (intent.phase === 'unloaded') return intent;
              command.signal?.throwIfAborted();
              if (intent.target.kind !== 'opfs')
                throw new Error('Asset residency source is invalid.');
              await deleteAssetObject(intent.target.ref.assetId, options);
              // After deletion, settle even if cancellation arrives. A failed settlement retains the intent.
              const tx = db.transaction([stores.ASSET_RESIDENCY_STORE], 'readwrite');
              try {
                const completed = await finishAssetResidencyTransitionInTransaction(
                  tx,
                  intent,
                  'unloaded',
                  permit
                );
                await tx.done;
                return completed;
              } catch (error) {
                try {
                  tx.abort();
                } catch {
                  /* The transaction can already be closed. */
                }
                await tx.done.catch(() => undefined);
                throw error;
              }
            },
            options
          );
          return result ?? 'busy';
        }, transitionPermit)
      )
    )
  ).then((result) => result ?? 'busy');
}

const RESTORE_STORES = [
  stores.ASSET_REFS_STORE,
  stores.ASSET_OWNERS_STORE,
  stores.ASSET_RESIDENCY_STORE,
  stores.SYNC_CAPTURE_STORE,
  stores.SYNC_CONNECTION_STORE,
  stores.MEDIA_LIBRARY_STORE,
  stores.AGGREGATE_PRESENTATIONS_STORE,
];

/** Staged bytes come from the existing transfer path. This command never fetches or creates a native identity. */
interface VerifiedAssetRestore {
  copy: AssetResidencyCopy;
  sourceBlob: Blob;
  authorization: SyncConnectionIdentity;
  signal?: AbortSignal;
}

async function checkRestoreSource(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  expected: AssetResidencyCopy,
  authorization: SyncConnectionIdentity
): Promise<void> {
  const metadata = await checkSyncConnectionAdmission(tx, expected.remote.binding, authorization);
  if (!metadata || !same(metadata.binding, expected.remote.binding))
    throw new Error('Asset residency connection changed.');
  const current = await readAssetResidencyCopyInTransaction(tx, expected.id);
  const completed = { ...expected, revision: expected.revision + 1, phase: 'resident' };
  if (!same(current, expected) && !same(current, completed))
    throw new Error('Asset residency restore intent changed.');
  if (expected.target.kind === 'inline-image') {
    await readInlineSource(tx, expected);
    return;
  }
  const expectedRef = expected.target.ref;
  const ref = parseAssetRef(await tx.objectStore(stores.ASSET_REFS_STORE).get(expectedRef.assetId));
  const rawOwners: unknown[] = await tx
    .objectStore(stores.ASSET_OWNERS_STORE)
    .index('assetId')
    .getAll(expectedRef.assetId);
  const owners = rawOwners.map(parseAssetOwner);
  if (
    !same(ref, expectedRef) ||
    owners.length === 0 ||
    owners.some((owner) => !owner || owner.assetId !== expectedRef.assetId)
  )
    throw new Error('Asset residency restore source changed.');
}

/** Restore only missing physical bytes, then settle the retained copy without an authored native mutation. */
export async function restoreVerifiedAssetObject(
  input: VerifiedAssetRestore,
  options: AssetOpfsOptions = {}
): Promise<AssetResidencyCopy | 'busy'> {
  const copy = parseAssetResidencyRecord(input.copy);
  const authorization = parseSyncConnectionIdentity(input.authorization);
  const { sourceBlob, signal } = input;
  if (
    !copy ||
    copy.kind !== 'copy' ||
    (copy.phase !== 'unloaded' && (copy.phase !== 'unloading' || copy.target.kind !== 'opfs')) ||
    !authorization
  )
    throw new Error('Asset residency restore command is invalid.');
  const target = copy.target;
  const db = await initDB();
  return runResidencyTransition(options, (transition) =>
    runWithAssetResourceRead(async () => {
      if (target.kind === 'inline-image') {
        if (
          sourceBlob.size !== target.size ||
          (await hashInlineSource(sourceBlob, signal)) !== copy.remote.sha256
        )
          throw new Error('Asset residency source checksum mismatch.');
        return runWithPersistenceMutationPermit(async (permit) => {
          const tx = db.transaction(RESTORE_STORES, 'readwrite');
          try {
            await checkRestoreSource(tx, copy, authorization);
            signal?.throwIfAborted();
            const result = await restoreInlineInTransaction(tx, copy, sourceBlob, permit);
            signal?.throwIfAborted();
            await tx.done;
            return result;
          } catch (error) {
            try {
              tx.abort();
            } catch {
              /* The transaction can already be closed. */
            }
            await tx.done.catch(() => undefined);
            throw error;
          }
        });
      }
      const ref = target.ref;
      const assertCurrent = async () => {
        signal?.throwIfAborted();
        const tx = db.transaction(RESTORE_STORES, 'readonly');
        await checkRestoreSource(tx, copy, authorization);
        await tx.done;
        signal?.throwIfAborted();
      };
      await assertCurrent();
      const installed = await restoreMissingAssetObject(
        {
          ref,
          sourceBlob,
          sha256: copy.remote.sha256,
          operationId: copy.operationId,
          ...(signal ? { signal } : {}),
          assertCurrent,
        },
        { ...options, persistenceTransitionPermit: transition }
      );
      if (installed === 'busy') return 'busy';
      return runWithPersistenceMutationPermit(async (permit) => {
        const tx = db.transaction(RESTORE_STORES, 'readwrite');
        try {
          await checkRestoreSource(tx, copy, authorization);
          const result = await finishAssetResidencyTransitionInTransaction(
            tx,
            copy,
            'resident',
            permit
          );
          await tx.done;
          return result;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* The transaction can already be closed. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      });
    })
  );
}

async function readInlineSource(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  copy: AssetResidencyCopy
) {
  const target = copy.target;
  if (target.kind !== 'inline-image') throw new Error('Asset residency inline target is invalid.');
  const rawMedia: unknown = await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(target.mediaId);
  const media = parseMediaLibraryEntry(rawMedia);
  const rootKey = captureRootKey(copy.remote.binding.spaceId, 'media', target.mediaId);
  const state = parseSyncCaptureRecord(
    await tx.objectStore(stores.SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', rootKey]))
  );
  const profile = parseSyncCaptureRecord(
    await tx.objectStore(stores.SYNC_CAPTURE_STORE).get('profile')
  );
  if (
    !isRecord(rawMedia) ||
    !media ||
    media.id !== target.mediaId ||
    media.source.kind !== 'screenshot' ||
    media.lifecycle?.storageClass === 'temporary' ||
    media.createdAt !== target.createdAt ||
    (media.workspaceRevision ?? 0) !== target.workspaceRevision ||
    media.size !== target.size ||
    media.mimeType !== target.mimeType ||
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    !state ||
    state.kind !== 'root-state' ||
    state.deleted ||
    state.rootKey !== rootKey ||
    state.generation !== target.rootGeneration ||
    state.nativeDigest !== target.nativeDigest ||
    state.nativeRevision !== target.workspaceRevision
  )
    throw new Error('Asset residency inline source changed.');
  const rawPresentation: unknown = await tx
    .objectStore(stores.AGGREGATE_PRESENTATIONS_STORE)
    .get(['image', target.mediaId]);
  const presentation =
    rawPresentation === undefined ? null : parseAggregatePresentationEntry(rawPresentation);
  if (
    (rawPresentation !== undefined && (!isRecord(rawPresentation) || !presentation)) ||
    (target.duplicatePreview &&
      (!presentation ||
        presentation.aggregateId !== target.mediaId ||
        presentation.aggregateKind !== 'image' ||
        presentation.presentationRevision !== target.duplicatePreview.presentationRevision))
  )
    throw new Error('Asset residency inline presentation changed.');
  return { target, rawMedia, media, rawPresentation, presentation };
}

async function unloadInlineInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  copy: AssetResidencyCopy,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyCopy> {
  const { target, rawMedia, media, rawPresentation, presentation } = await readInlineSource(
    tx,
    copy
  );
  const rawOperations: unknown[] = await tx.objectStore(stores.ASSET_OPERATIONS_STORE).getAll();
  for (const value of rawOperations) {
    const backup = parseBackupAssetOperation(value);
    const archive = parseArchiveRestoreSession(value);
    if (!backup && !archive && !parsePhysicalDeleteAssetOperation(value))
      throw new Error('Asset residency rollback authority is invalid.');
    if (
      (backup &&
        backup.status !== 'committed' &&
        backup.compensations.some((item) => item.nextMediaId === target.mediaId)) ||
      (archive?.status === 'pending' &&
        archive.currentRoot !== null &&
        archive.rootIdMap[archive.currentRoot] === target.mediaId)
    )
      throw new AssetResidencyProtectedError('Asset residency source has unfinished restore.');
  }
  if (copy.phase === 'unloaded') {
    if (
      media.blob !== undefined ||
      (target.duplicatePreview && presentation?.previewBlob !== undefined)
    )
      throw new Error('Asset residency unloaded source contains unexpected bytes.');
    return copy;
  }
  if (!inlineBytesMatch(target, media.blob, presentation?.previewBlob))
    throw new Error('Asset residency inline bytes changed.');
  const { blob: _blob, ...metadata } = rawMedia;
  await tx.objectStore(stores.MEDIA_LIBRARY_STORE).put(metadata);
  if (target.duplicatePreview && isRecord(rawPresentation)) {
    const { previewBlob: _preview, ...retained } = rawPresentation;
    await tx.objectStore(stores.AGGREGATE_PRESENTATIONS_STORE).put(retained);
  }
  return finishAssetResidencyTransitionInTransaction(tx, copy, 'unloaded', permit);
}

async function restoreInlineInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  copy: AssetResidencyCopy,
  source: Blob,
  permit: PersistenceMutationPermit
): Promise<AssetResidencyCopy> {
  const { target, rawMedia, media, rawPresentation, presentation } = await readInlineSource(
    tx,
    copy
  );
  const current = await readAssetResidencyCopyInTransaction(tx, copy.id);
  if (current?.phase === 'resident') {
    if (!inlineBytesMatch(target, media.blob, presentation?.previewBlob))
      throw new Error('Asset residency resident source bytes changed.');
    return current;
  }
  if (
    media.blob !== undefined ||
    (target.duplicatePreview && presentation?.previewBlob !== undefined)
  )
    throw new Error('Asset residency unloaded source contains unexpected bytes.');
  await tx
    .objectStore(stores.MEDIA_LIBRARY_STORE)
    .put({ ...rawMedia, blob: source.slice(0, source.size, target.blobType) });
  if (target.duplicatePreview && isRecord(rawPresentation))
    await tx.objectStore(stores.AGGREGATE_PRESENTATIONS_STORE).put({
      ...rawPresentation,
      previewBlob: source.slice(0, source.size, target.duplicatePreview.blobType),
    });
  return finishAssetResidencyTransitionInTransaction(tx, copy, 'resident', permit);
}

async function hashInlineSource(source: Blob, signal?: AbortSignal): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < source.size; offset += 64 * 1024) {
    signal?.throwIfAborted();
    const chunk = new Uint8Array(await source.slice(offset, offset + 64 * 1024).arrayBuffer());
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  signal?.throwIfAborted();
  return Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inlineBytesMatch(
  target: Extract<AssetResidencyCopy['target'], { kind: 'inline-image' }>,
  blob: Blob | undefined,
  preview: Blob | undefined
): boolean {
  return (
    !!blob &&
    blob.size === target.size &&
    blob.type === target.blobType &&
    (!target.duplicatePreview ||
      (!!preview &&
        preview.size === target.size &&
        preview.type === target.duplicatePreview.blobType))
  );
}
