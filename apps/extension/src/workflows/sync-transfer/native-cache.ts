import type { SyncCacheReleaseResult, SyncCacheRootStatus } from '../../contracts/sync-cache';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import { isNativeEditingRootReady } from './native-residency';
import { createLogger } from '@sniptale/platform/observability/logger';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import * as stores from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../../composition/persistence/infrastructure/indexed-db/mutation';
import {
  runWithPersistenceMutationTransition,
  type PersistenceMutationTransitionPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import {
  collectNativeEditingResources,
  NATIVE_EDITING_RESOURCE_STORES,
  type NativeEditingRoot,
} from '../../composition/persistence/assets/editing-resources';
import {
  readAssetFile,
  MissingAssetObjectError,
  type AssetRef,
} from '../../composition/persistence/assets';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { parseMediaLibraryEntry } from '../../composition/persistence/media-library/read-guards';
import {
  readAssetResidencyCopyInTransaction,
  readAssetResidencyRootInTransaction,
  readAssetResidencySettingsInTransaction,
  setAssetResidencyBudgetInTransaction,
  setAssetResidencyRootPinnedInTransaction,
  touchAssetResidencyRootInTransaction,
} from '../../composition/persistence/assets/residency';
import {
  assetResidencyCopyId,
  type AssetResidencyTarget,
} from '../../composition/persistence/assets/residency-records';
import {
  AssetResidencyProtectedError,
  unloadVerifiedAssetObject,
  restoreVerifiedAssetObject,
} from '../../composition/persistence/assets/residency-maintenance';
import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { readEnabledCaptureProfile } from '../../composition/persistence/sync-capture/capture';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import {
  freezeImageInTransaction,
  digestCapturedImageRows,
} from '../../composition/persistence/sync-capture/image-snapshot';
import type {
  SyncConnectionBinding,
  SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { verifyCatalogCopy, type CatalogCopyIndex } from './residency-copy';
import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import type { SyncRemoteStore } from './remote-store';

const logger = createLogger({ namespace: 'SyncCache' });
const ROOT_STORES = {
  media: stores.MEDIA_LIBRARY_STORE,
  'video-project': stores.VIDEO_PROJECTS_STORE,
  'video-review': stores.VIDEO_WORKSPACES_STORE,
  'scenario-project': stores.SCENARIO_PROJECTS_STORE,
};
const READ_STORES = [
  ...new Set([
    ...NATIVE_EDITING_RESOURCE_STORES,
    stores.ASSET_RESIDENCY_STORE,
    stores.SYNC_CAPTURE_STORE,
  ]),
];
type Database = Awaited<ReturnType<typeof initDB>>;
type Candidate = { kind: 'opfs'; ref: AssetRef } | { kind: 'inline-image'; mediaId: string };
export interface NativeCacheReleaseInput {
  root: NativeEditingRoot;
  /** Internal policy selection. Product IPC accepts only the native root. */
  targetIds?: ReadonlySet<string>;
  binding: SyncConnectionBinding;
  authorization: SyncConnectionIdentity;
  index: CatalogCopyIndex;
  remote: SyncRemoteStore;
  signal: AbortSignal;
}

async function rootExists(db: Database, root: NativeEditingRoot): Promise<boolean> {
  if ((await db.get(ROOT_STORES[root.rootKind], root.rootId)) !== undefined) return true;
  return (
    root.rootKind === 'video-review' &&
    (await db.get(stores.MEDIA_LIBRARY_STORE, root.rootId)) !== undefined
  );
}

/** Local usage does not enable synchronization or create sidecars for an unsaved/missing document. */
export async function touchNativeCacheRoot(
  root: NativeEditingRoot,
  now = Date.now()
): Promise<void> {
  await runWithIndexedDbMutation(async (db, permit) => {
    if (!(await rootExists(db, root))) return;
    const tx = db.transaction(
      [
        ...new Set([
          stores.ASSET_RESIDENCY_STORE,
          stores.SYNC_CAPTURE_STORE,
          stores.MEDIA_LIBRARY_STORE,
          ROOT_STORES[root.rootKind],
        ]),
      ],
      'readwrite'
    );
    try {
      const profile = await readEnabledCaptureProfile(tx);
      if (
        profile &&
        ((await tx.objectStore(ROOT_STORES[root.rootKind]).get(root.rootId)) !== undefined ||
          (root.rootKind === 'video-review' &&
            (await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(root.rootId)) !== undefined))
      )
        await touchAssetResidencyRootInTransaction(tx, root.rootKind, root.rootId, now, permit);
      await tx.done;
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

/** This records pin intent only. The foreground owner must prepare all dependencies before promising offline readiness. */
export async function setNativeCacheRootPinned(
  root: NativeEditingRoot,
  pinned: boolean,
  now = Date.now()
) {
  return runWithIndexedDbMutation(async (db, permit) => {
    const tx = db.transaction(READ_STORES, 'readwrite');
    try {
      await collectNativeEditingResources(tx, root, 'backup');
      const intent = await setAssetResidencyRootPinnedInTransaction(
        tx,
        root.rootKind,
        root.rootId,
        pinned,
        now,
        permit
      );
      await tx.done;
      return intent;
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

/** Read the soft originals budget without initializing Settings rows. */
export async function readNativeCacheSettings() {
  const db = await initDB();
  const tx = db.transaction([stores.ASSET_RESIDENCY_STORE], 'readonly');
  const value = await readAssetResidencySettingsInTransaction(tx);
  await tx.done;
  return value;
}

/** The current Settings revision prevents an old panel from replacing a newer budget. */
export async function setNativeCacheBudget(budgetBytes: number, revision: number) {
  return runWithIndexedDbMutation(async (db, permit) => {
    const tx = db.transaction([stores.ASSET_RESIDENCY_STORE], 'readwrite');
    try {
      const value = await setAssetResidencyBudgetInTransaction(tx, budgetBytes, revision, permit);
      await tx.done;
      return value;
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

async function candidates(db: Database, root: NativeEditingRoot): Promise<Candidate[]> {
  const tx = db.transaction(READ_STORES, 'readonly');
  const resources = await collectNativeEditingResources(tx, root, 'backup');
  await tx.done;
  return [
    ...resources.refs.map((ref): Candidate => ({ kind: 'opfs', ref })),
    ...resources.inlineMediaIds.map((mediaId): Candidate => ({ kind: 'inline-image', mediaId })),
  ];
}

async function localSource(db: Database, candidate: Candidate, binding: SyncConnectionBinding) {
  if (candidate.kind === 'opfs') {
    try {
      return {
        target: { kind: 'opfs' as const, ref: candidate.ref },
        blob: await readAssetFile(candidate.ref, candidate.ref.assetId),
        preview: null,
      };
    } catch (error) {
      if (
        error instanceof MissingAssetObjectError ||
        (error instanceof DOMException && error.name === 'NotFoundError')
      )
        return null;
      throw error;
    }
  }
  const tx = db.transaction(READ_STORES, 'readonly');
  const raw: unknown = await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(candidate.mediaId);
  const media = parseMediaLibraryEntry(raw);
  if (!media || media.source.kind !== 'screenshot') throw new Error('Native cache source changed.');
  if (!media.blob) {
    await tx.done;
    return null;
  }
  const profile = await readEnabledCaptureProfile(tx);
  const state = parseSyncCaptureRecord(
    await tx
      .objectStore(stores.SYNC_CAPTURE_STORE)
      .get(JSON.stringify(['root-state', captureRootKey(binding.spaceId, 'media', media.id)]))
  );
  if (
    !profile ||
    profile.spaceId !== binding.spaceId ||
    profile.createdAt !== binding.profileCreatedAt ||
    profile.connectionGeneration !== binding.connectionGeneration ||
    !state ||
    state.kind !== 'root-state' ||
    state.deleted ||
    state.basis.length === 0
  ) {
    await tx.done;
    return null;
  }
  const rows = await freezeImageInTransaction(tx, media.id);
  const nativeDigest = digestCapturedImageRows(rows);
  if (state.nativeDigest !== nativeDigest)
    throw new Error('Native cache image has an unpublished revision.');
  await tx.done;
  const target: AssetResidencyTarget = {
    kind: 'inline-image',
    mediaId: media.id,
    createdAt: media.createdAt,
    workspaceRevision: media.workspaceRevision ?? 0,
    rootGeneration: state.generation,
    nativeDigest,
    size: media.size,
    mimeType: media.mimeType,
    blobType: media.blob.type,
  };
  return {
    target,
    blob: media.blob,
    preview:
      rows.presentation?.previewBlob instanceof Blob
        ? { blob: rows.presentation.previewBlob, revision: rows.presentation.presentationRevision }
        : null,
  };
}

async function releaseCandidate(
  db: Database,
  candidate: Candidate,
  args: NativeCacheReleaseInput,
  lastUsedAt: number
): Promise<
  { kind: 'released'; bytes: number } | { kind: 'absent' | 'unavailable' | 'busy' | 'protected' }
> {
  return runWithPersistenceMutationTransition(
    async (transition: PersistenceMutationTransitionPermit) => {
      const prepared = await runWithAssetResourceRead(async () => {
        args.signal.throwIfAborted();
        const source = await localSource(db, candidate, args.binding);
        if (!source) return null;
        const verified = await verifyCatalogCopy(args.index, source.blob, args.remote, args.signal);
        if (!verified) return false;
        const tx = db.transaction([stores.ASSET_RESIDENCY_STORE], 'readonly');
        let copy = await readAssetResidencyCopyInTransaction(
          tx,
          assetResidencyCopyId(source.target)
        );
        await tx.done;
        if (copy && copy.phase !== 'resident') {
          if (copy.target.kind !== 'opfs')
            throw new Error('Native cache source contains unexpected bytes.');
          const repaired = await restoreVerifiedAssetObject(
            {
              copy,
              sourceBlob: source.blob,
              authorization: args.authorization,
              signal: args.signal,
            },
            { persistenceTransitionPermit: transition }
          );
          if (repaired === 'busy') return 'busy';
          copy = repaired;
        }
        if (
          source.target.kind === 'inline-image' &&
          source.preview &&
          source.preview.blob.size === source.blob.size
        ) {
          const preview = source.preview.blob;
          const hash = await digestBackupObject(
            {
              size: preview.size,
              pipeTo: (sink, signal) => preview.stream().pipeTo(sink, signal ? { signal } : {}),
            },
            args.signal
          );
          if (hash === verified.sha256)
            source.target.duplicatePreview = {
              presentationRevision: source.preview.revision,
              blobType: preview.type,
            };
        }
        return {
          target: source.target,
          bytes: source.blob.size,
          remote: {
            binding: structuredClone(args.binding),
            key: verified.remoteKey,
            sha256: verified.sha256,
          },
          revision: copy?.revision ?? null,
        };
      });
      if (prepared === 'busy') return { kind: 'busy' };
      if (prepared === null) return { kind: 'absent' };
      if (prepared === false) return { kind: 'unavailable' };
      try {
        const outcome = await unloadVerifiedAssetObject(
          {
            draft: {
              operationId: crypto.randomUUID(),
              target: prepared.target,
              remote: prepared.remote,
              lastUsedAt,
            },
            expectedRevision: prepared.revision,
            authorization: args.authorization,
            signal: args.signal,
          },
          { persistenceTransitionPermit: transition }
        );
        return outcome === 'busy' ? { kind: 'busy' } : { kind: 'released', bytes: prepared.bytes };
      } catch (error) {
        if (error instanceof AssetResidencyProtectedError) return { kind: 'protected' };
        throw error;
      }
    }
  );
}

/** One manual release uses checked catalog mappings and the existing native unload command. No file body enters a queue result. */
export async function releaseNativeEditingRoot(
  args: NativeCacheReleaseInput
): Promise<SyncCacheReleaseResult> {
  const db = await initDB();
  if (args.index.spaceId !== args.binding.spaceId)
    throw new Error('Native cache namespace changed.');
  const tx = db.transaction([stores.SYNC_CAPTURE_STORE, stores.ASSET_RESIDENCY_STORE], 'readonly');
  const profile = await readEnabledCaptureProfile(tx);
  const state = parseSyncCaptureRecord(
    await tx
      .objectStore(stores.SYNC_CAPTURE_STORE)
      .get(
        JSON.stringify([
          'root-state',
          captureRootKey(args.binding.spaceId, args.root.rootKind, args.root.rootId),
        ])
      )
  );
  const intent = await readAssetResidencyRootInTransaction(
    tx,
    args.root.rootKind,
    args.root.rootId
  );
  await tx.done;

  if (
    !state ||
    state.kind !== 'root-state' ||
    state.deleted ||
    state.basis.length === 0 ||
    state.basis.some((id) => {
      const operation = args.index.operations.get(id);
      return (
        !operation ||
        operation.rootKind !== args.root.rootKind ||
        operation.rootId !== args.root.rootId
      );
    })
  )
    throw new Error('Native cache root has no checked remote publication.');
  if (
    !profile ||
    profile.spaceId !== args.binding.spaceId ||
    profile.createdAt !== args.binding.profileCreatedAt ||
    profile.connectionGeneration !== args.binding.connectionGeneration
  )
    throw new Error('Native cache profile changed.');
  const result: SyncCacheReleaseResult = {
    released: 0,
    releasedBytes: 0,
    absent: 0,
    unavailable: 0,
    busy: 0,
    protected: 0,
  };
  logger.info('sync-cache-release-started');
  try {
    for (const candidate of await candidates(db, args.root)) {
      if (args.targetIds && !args.targetIds.has(assetResidencyCopyId(candidate))) continue;
      args.signal.throwIfAborted();
      const outcome = await releaseCandidate(
        db,
        candidate,
        args,
        intent?.lastUsedAt ?? state.createdAt
      );
      if (outcome.kind === 'released') {
        result.released++;
        result.releasedBytes += outcome.bytes;
      } else result[outcome.kind]++;
    }
    logger.info('sync-cache-release-completed', { ...result });
    return result;
  } catch (error) {
    logger.warn('sync-cache-release-incomplete', { ...result });
    throw error;
  }
}

/** Local projection only. A release still requires a fresh checked catalog and exact physical verification. */
export async function readNativeCacheRootStatus(
  root: NativeEditingRoot
): Promise<SyncCacheRootStatus> {
  const db = await initDB();
  const tx = db.transaction([stores.SYNC_CAPTURE_STORE, stores.ASSET_RESIDENCY_STORE], 'readonly');
  const profile = await readEnabledCaptureProfile(tx);
  const intent = await readAssetResidencyRootInTransaction(tx, root.rootKind, root.rootId);
  const state = profile
    ? parseSyncCaptureRecord(
        await tx
          .objectStore(stores.SYNC_CAPTURE_STORE)
          .get(
            JSON.stringify([
              'root-state',
              captureRootKey(profile.spaceId, root.rootKind, root.rootId),
            ])
          )
      )
    : null;
  await tx.done;
  const connection = profile ? await loadSyncConnection() : null;
  return {
    root: { ...root },
    configured: profile !== null,
    pinned: intent?.pinned ?? false,
    ready: profile !== null && (await isNativeEditingRootReady(root)),
    releaseAllowed: !!(
      profile &&
      connection?.phase === 'active' &&
      connection.binding.spaceId === profile.spaceId &&
      connection.binding.profileCreatedAt === profile.createdAt &&
      connection.binding.connectionGeneration === profile.connectionGeneration &&
      state?.kind === 'root-state' &&
      !state.deleted &&
      state.basis.length > 0
    ),
  };
}
