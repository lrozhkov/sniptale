import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import { createLogger } from '@sniptale/platform/observability/logger';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import {
  MEDIA_LIBRARY_STORE,
  SYNC_CAPTURE_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  SCENARIO_PROJECTS_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionBinding,
  type SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import type {
  SyncRemoteSelection,
  SyncNativeEditingRoot,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncProductClient } from '../../platform/runtime-messaging/sync-product-client';
import { readCheckedPersistedSyncCatalog } from './catalog-view';
import { syncCatalogRootKey } from './catalog-graph';
import { hashSyncText } from './wire-record';

const logger = createLogger({ namespace: 'SyncRetainedLibrary' });
const sources = [
  { rootKind: 'media', store: MEDIA_LIBRARY_STORE },
  { rootKind: 'video-project', store: VIDEO_PROJECTS_STORE },
  { rootKind: 'video-review', store: VIDEO_WORKSPACES_STORE },
  { rootKind: 'video-review', store: VIDEO_WORKSPACE_DRAFTS_STORE },
  { rootKind: 'scenario-project', store: SCENARIO_PROJECTS_STORE },
] as const;

/** A transient catalog snapshot. It grants no native write or byte-release authority. */
export interface RetainedLibraryPlan {
  binding: SyncConnectionBinding;
  authorization: SyncConnectionIdentity;
  missing: SyncRemoteSelection[];
  nativeRootCount: number;
  remoteBytesUpperBound: number;
}

/** Read native root keys, including drafts and Trash, without requesting original bodies. */
export async function readRetainedNativeRoots(
  root?: SyncNativeEditingRoot
): Promise<SyncNativeEditingRoot[]> {
  const db = await initDB();
  const tx = db.transaction([...new Set(sources.map((source) => source.store))], 'readonly');
  const keys = new Map<string, SyncNativeEditingRoot>();
  for (const source of sources) {
    if (root && source.rootKind !== root.rootKind) continue;
    const store = tx.objectStore(source.store);
    const keysForSource = root
      ? [await store.getKey(root.rootId)].filter((key) => key !== undefined)
      : await store.getAllKeys();
    for (const key of keysForSource) {
      if (typeof key !== 'string') throw new Error('Native library identity is invalid.');
      keys.set(syncCatalogRootKey(source.rootKind, key), {
        rootKind: source.rootKind,
        rootId: key,
      });
    }
  }
  await tx.done;
  return [...keys.values()];
}

/** A complete backup cannot silently omit unresolved or different native/server versions. */
export class RetainedLibraryNotReadyError extends Error {
  constructor(readonly code: 'catalog-incomplete' | 'conflict' | 'revision-changed') {
    super(`Library synchronization is not ready: ${code}.`);
  }
}

async function nativeCoversSelection(
  plan: RetainedLibraryPlan,
  root: SyncNativeEditingRoot,
  operationId: string
): Promise<boolean> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  const rootKey = captureRootKey(plan.binding.spaceId, root.rootKind, root.rootId);
  const key = JSON.stringify(['root-state', rootKey]);
  const state = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(key));
  await tx.done;
  return Boolean(
    profile?.kind === 'profile' &&
    profile.enabled &&
    profile.spaceId === plan.binding.spaceId &&
    profile.createdAt === plan.binding.profileCreatedAt &&
    profile.connectionGeneration === plan.binding.connectionGeneration &&
    state?.kind === 'root-state' &&
    state.key === key &&
    state.rootKey === rootKey &&
    !state.deleted &&
    state.basis.includes(operationId)
  );
}

async function checkConnection(plan: RetainedLibraryPlan): Promise<void> {
  const connection = await loadSyncConnection();
  if (
    !connection ||
    !sameSyncConnectionIdentity(connection.identity, plan.authorization) ||
    !sameConnectionScope(connection.binding, plan.binding) ||
    connection.binding.provider !== plan.binding.provider ||
    connection.binding.rootUrl !== plan.binding.rootUrl ||
    connection.binding.accountId !== plan.binding.accountId
  )
    throw new Error('Library backup connection changed.');
}

/** Inspect known catalog metadata and native keys without requesting file bodies or applying replicas. */
export async function planRetainedLibrary(): Promise<RetainedLibraryPlan | null> {
  const connection = await loadSyncConnection();
  if (!connection) return null;
  const plan: RetainedLibraryPlan = {
    binding: structuredClone(connection.binding),
    authorization: structuredClone(connection.identity),
    missing: [],
    nativeRootCount: 0,
    remoteBytesUpperBound: 0,
  };
  const catalog = await readCheckedPersistedSyncCatalog();
  if (
    !catalog ||
    catalog.invalid.length ||
    catalog.invalidOperations.length ||
    catalog.quarantined.length ||
    catalog.pending.length
  )
    throw new RetainedLibraryNotReadyError('catalog-incomplete');
  const roots = await readRetainedNativeRoots();
  const native = new Set(roots.map((root) => syncCatalogRootKey(root.rootKind, root.rootId)));
  plan.nativeRootCount = native.size;
  for (const root of catalog.roots.values()) {
    if (root.conflict || root.blocked || root.unavailableDependencies.length)
      throw new RetainedLibraryNotReadyError('conflict');
    if (root.deleted) continue;
    if (native.has(syncCatalogRootKey(root.rootKind, root.rootId))) {
      if (root.heads.length !== 1 || !(await nativeCoversSelection(plan, root, root.heads[0]!)))
        throw new RetainedLibraryNotReadyError('revision-changed');
      continue;
    }
    const current = root.heads.length === 1 ? catalog.operations.get(root.heads[0]!) : undefined;
    if (!current?.operation.envelope) throw new Error('Library catalog root is unavailable.');
    plan.missing.push({
      rootKind: root.rootKind,
      rootId: root.rootId,
      operationId: current.operation.operationId,
      sourceDigest: hashSyncText(current.operationText),
    });
    plan.remoteBytesUpperBound += current.operation.envelope.descriptor.totalBytes;
  }
  await checkConnection(plan);
  return plan;
}

/** Materialize only absent roots; existing native revisions remain under their normal writer authority. */
export async function prepareRetainedLibrary(
  plan: RetainedLibraryPlan,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  await checkConnection(plan);
  const client = createSyncProductClient();
  for (const selection of plan.missing) {
    signal?.throwIfAborted();
    await checkConnection(plan);
    if ((await readRetainedNativeRoots(selection)).length > 0) {
      if (!(await nativeCoversSelection(plan, selection, selection.operationId)))
        throw new RetainedLibraryNotReadyError('revision-changed');
      continue;
    }
    const accepted = await client.prepareReplica(selection, true);
    if (accepted.kind !== 'accepted') throw new Error('Library backup preparation refused.');
    const cancel = () => {
      void client
        .cancel(accepted.requestId)
        .catch(() => logger.warn('library-backup-cancel-deferred'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      // The caller retains its reader until execution settles, including refused cancellation.
      const result = await client.waitForOperation(accepted.requestId);
      signal?.throwIfAborted();
      await checkConnection(plan);
      if (
        result.job?.state !== 'ready' ||
        result.completion?.kind !== 'replica' ||
        result.completion.selection.rootKind !== selection.rootKind ||
        result.completion.selection.rootId !== selection.rootId ||
        result.completion.selection.operationId !== selection.operationId ||
        result.completion.selection.sourceDigest !== selection.sourceDigest ||
        (await readRetainedNativeRoots(selection)).length === 0
      )
        throw new Error('Library backup preparation is incomplete.');
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }
  await checkConnection(plan);
}
