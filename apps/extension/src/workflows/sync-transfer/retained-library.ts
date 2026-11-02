import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import type { MediaHubBackupExportOptions } from '../media-hub-backup/v6/contracts';
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import { prepareMediaHubBackupRootsFromLibraryV6 } from '../media-hub-backup/v6/inventory';
import { isMediaBackupItemSelected } from '../media-hub-backup/v6/inventory/media';
import { isVideoProjectBackupSelected } from '../media-hub-backup/v6/inventory/video-projects';
import { isScenarioBackupProjectSelected } from '../media-hub-backup/v6/inventory/scenario-projects';
import { parseSyncLibraryBackupOptions } from '../../contracts/messaging/contracts/runtime/sync-product';
import type { SyncLibraryBackupOptions } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { parsePortableSyncRoot } from './prepared-root';
import { receiveSelectedCatalogRoot } from './incoming-selected';
import { prepareNativeEditingRoot, type SyncDownloadAllowance } from './native-residency';
import type { scanSyncCatalog } from './catalog';
import type { SyncRemoteStore } from './remote-store';
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
  parseSyncConnectionIdentity,
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

/** Observe retained local data for Settings review without loading keys, rows or file bodies. */
export async function readRetainedNativePresence(): Promise<boolean> {
  const db = await initDB();
  const tx = db.transaction([...new Set(sources.map((source) => source.store))], 'readonly');
  try {
    const counts: unknown[] = await Promise.all(
      sources.map((source) => tx.objectStore(source.store).count())
    );
    await tx.done;
    if (
      counts.some((count) => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
    )
      throw new Error('Retained native presence count is invalid.');
    return counts.some((count) => typeof count === 'number' && count > 0);
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
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

async function checkConnection(plan: RetainedLibraryPlan, activeOnly = false): Promise<void> {
  const connection = await loadSyncConnection();
  if (
    !connection ||
    (activeOnly && connection.phase !== 'active') ||
    !sameSyncConnectionIdentity(connection.identity, plan.authorization) ||
    !sameConnectionScope(connection.binding, plan.binding) ||
    connection.binding.provider !== plan.binding.provider ||
    connection.binding.rootUrl !== plan.binding.rootUrl ||
    connection.binding.accountId !== plan.binding.accountId
  )
    throw new Error('Library backup connection changed.');
}

/** Inspect known catalog metadata and native keys without requesting file bodies or applying replicas. */
export async function planRetainedLibrary(
  options?: MediaHubBackupExportOptions
): Promise<RetainedLibraryPlan | null> {
  const normalized =
    options === undefined ? undefined : normalizeLibraryOptions(structuredClone(options));
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
    if (normalized && !(await eligibleCatalogRoot(catalog, root, normalized, plan.binding.spaceId)))
      continue;
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

type ProductClient = ReturnType<typeof createSyncProductClient>;
type PreparationResult = Awaited<ReturnType<ProductClient['waitForOperation']>>;

async function withLibraryPreparation<T>(
  client: ProductClient,
  requestId: string,
  signal: AbortSignal | undefined,
  complete: (result: PreparationResult) => Promise<T>
): Promise<T> {
  const cancel = () => {
    void client.cancel(requestId).catch(() => logger.warn('library-backup-cancel-deferred'));
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    // Keep the caller's reader until settlement and completion checks finish, even if cancellation fails.
    return await complete(await client.waitForOperation(requestId));
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
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
    await withLibraryPreparation(client, accepted.requestId, signal, async (result) => {
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
    });
  }
  await checkConnection(plan);
}

type BackupCatalog = Awaited<ReturnType<typeof scanSyncCatalog>>;

function normalizeLibraryOptions(options: MediaHubBackupExportOptions): SyncLibraryBackupOptions {
  const normalized = createMediaHubBackupExportOptions(options);
  const parsed = parseSyncLibraryBackupOptions({
    includeDrafts: normalized.includeDrafts,
    includeSourceMetadata: normalized.includeSourceMetadata,
    includeTelemetry: normalized.includeTelemetry,
    includeWebSnapshots: normalized.includeWebSnapshots,
    scope: normalized.scope,
    ...(normalized.scope === 'selected' && normalized.selected
      ? { selected: normalized.selected }
      : {}),
  });
  if (!parsed) throw new Error('Library backup selection is invalid.');
  return parsed;
}

function selectedRootId(root: SyncNativeEditingRoot, options: SyncLibraryBackupOptions): boolean {
  if (options.scope === 'all') return true;
  const ids =
    root.rootKind === 'video-project'
      ? options.selected?.videoProjectIds
      : root.rootKind === 'scenario-project'
        ? options.selected?.scenarioProjectIds
        : options.selected?.mediaAssetIds;
  return Boolean(ids?.includes(root.rootId));
}

async function eligibleCatalogRoot(
  catalog: BackupCatalog,
  root: SyncNativeEditingRoot & { heads: string[]; deleted: boolean },
  options: SyncLibraryBackupOptions,
  spaceId: string
): Promise<boolean> {
  if (root.deleted || !selectedRootId(root, options)) return false;
  if (!root.heads.length) throw new RetainedLibraryNotReadyError('catalog-incomplete');
  let admitted = false;
  for (const id of root.heads) {
    const current = catalog.operations.get(id);
    if (
      !current?.operation.envelope ||
      current.operation.operationId !== id ||
      current.operation.rootKind !== root.rootKind ||
      current.operation.rootId !== root.rootId ||
      current.operation.spaceId !== spaceId
    )
      throw new RetainedLibraryNotReadyError('catalog-incomplete');
    const parsed = await parsePortableSyncRoot(
      current.operation.envelope,
      current.operation.reviewSourceMediaId
    );
    if (
      (parsed.kind === 'image' ? 'media' : parsed.kind) !== root.rootKind ||
      parsed.envelope.descriptor.rootId !== root.rootId
    )
      throw new RetainedLibraryNotReadyError('catalog-incomplete');
    if (parsed.kind === 'video-project') {
      admitted ||= isVideoProjectBackupSelected(
        root.rootId,
        parsed.metadata.entry.lifecycle,
        options
      );
    } else if (parsed.kind === 'scenario-project') {
      admitted ||= isScenarioBackupProjectSelected(
        root.rootId,
        parsed.metadata.entry.lifecycle,
        options
      );
    } else {
      const project =
        parsed.kind === 'video-review' ? parsed.metadata.videoReview?.workspace.project : undefined;
      if (project?.lifecycle.trashedAt !== undefined) continue;
      admitted ||= isMediaBackupItemSelected(
        {
          id: root.rootId,
          source: parsed.metadata.entry.source,
          ...(project
            ? { lifecycle: project.lifecycle }
            : parsed.metadata.entry.lifecycle
              ? { lifecycle: parsed.metadata.entry.lifecycle }
              : {}),
        },
        options
      );
    }
  }
  return admitted;
}

/** Await one exact Gallery backup request; disconnected local exports need no runtime action. */
export async function prepareLibraryBackup(
  options: MediaHubBackupExportOptions,
  signal?: AbortSignal,
  expected?: SyncConnectionIdentity
): Promise<boolean> {
  const input = structuredClone(options);
  const expectedIdentity = expected === undefined ? undefined : structuredClone(expected);
  signal?.throwIfAborted();
  const connection = await loadSyncConnection();
  if (!connection) {
    if (expectedIdentity !== undefined) throw new Error('Library backup connection changed.');
    return false;
  }
  if (
    connection.phase !== 'active' ||
    (expectedIdentity && !sameSyncConnectionIdentity(connection.identity, expectedIdentity))
  )
    throw new Error('Library backup connection changed.');
  const plan: RetainedLibraryPlan = {
    binding: structuredClone(connection.binding),
    authorization: structuredClone(connection.identity),
    missing: [],
    nativeRootCount: 0,
    remoteBytesUpperBound: 0,
  };
  const normalized = normalizeLibraryOptions(input);
  await checkConnection(plan, true);
  signal?.throwIfAborted();
  const client = createSyncProductClient();
  const accepted = await client.prepareLibraryBackup({
    expected: structuredClone(plan.authorization),
    options: structuredClone(normalized),
  });
  if (accepted.kind !== 'accepted') throw new Error('Library backup preparation refused.');
  return withLibraryPreparation(client, accepted.requestId, signal, async (result) => {
    signal?.throwIfAborted();
    await checkConnection(plan, true);
    signal?.throwIfAborted();
    const completedIdentity =
      result.completion?.kind === 'library-backup'
        ? parseSyncConnectionIdentity(result.completion.expected)
        : null;
    const requestedIdentity = parseSyncConnectionIdentity(plan.authorization);
    const completedOptions =
      result.completion?.kind === 'library-backup'
        ? parseSyncLibraryBackupOptions(result.completion.options)
        : null;
    const requestedOptions = parseSyncLibraryBackupOptions(normalized);
    if (
      result.job?.requestId !== accepted.requestId ||
      result.job.kind !== 'library-backup-prepare' ||
      result.job.state !== 'ready' ||
      result.completion?.kind !== 'library-backup' ||
      !completedIdentity ||
      !requestedIdentity ||
      !sameSyncConnectionIdentity(completedIdentity, requestedIdentity) ||
      !completedOptions ||
      !requestedOptions ||
      JSON.stringify(completedOptions) !== JSON.stringify(requestedOptions)
    )
      throw new Error('Library backup preparation is incomplete.');
    return true;
  });
}

/** Prepare the canonical selected Library graph under one cumulative action-owned allowance. */
export async function prepareLibraryBackupInRuntime(args: {
  catalog: BackupCatalog;
  binding: SyncConnectionBinding;
  authorization: SyncConnectionIdentity;
  expected: SyncConnectionIdentity;
  options: SyncLibraryBackupOptions;
  remote: SyncRemoteStore;
  signal: AbortSignal;
  downloadAllowance: SyncDownloadAllowance;
}): Promise<void> {
  const catalog = structuredClone(args.catalog);
  const options = parseSyncLibraryBackupOptions(structuredClone(args.options));
  const expected = structuredClone(args.expected);
  const plan: RetainedLibraryPlan = {
    binding: structuredClone(args.binding),
    authorization: structuredClone(args.authorization),
    missing: [],
    nativeRootCount: 0,
    remoteBytesUpperBound: 0,
  };
  if (
    !options ||
    !sameSyncConnectionIdentity(expected, plan.authorization) ||
    typeof args.downloadAllowance?.reserveObject !== 'function'
  )
    throw new Error('Library backup connection changed.');
  return runWithAssetResourceRead(async () => {
    const current = async () => {
      args.signal.throwIfAborted();
      await checkConnection(plan, true);
      args.signal.throwIfAborted();
    };
    await current();
    if (
      catalog.invalid.length ||
      catalog.invalidOperations.length ||
      catalog.quarantined.length ||
      catalog.pending.length
    )
      throw new RetainedLibraryNotReadyError('catalog-incomplete');
    const covered = new Map<string, { root: SyncNativeEditingRoot; operationId: string }>();
    const requireCovered = async (root: SyncNativeEditingRoot, operationId: string) => {
      if (
        !(await readRetainedNativeRoots(root)).length ||
        !(await nativeCoversSelection(plan, root, operationId))
      )
        throw new RetainedLibraryNotReadyError('revision-changed');
    };
    for (const root of catalog.roots.values()) {
      await current();
      if (!(await eligibleCatalogRoot(catalog, root, options, plan.binding.spaceId))) continue;
      if (
        root.conflict ||
        root.blocked ||
        root.unavailableDependencies.length ||
        root.heads.length !== 1
      )
        throw new RetainedLibraryNotReadyError('conflict');
      const operation = catalog.operations.get(root.heads[0]!)!;
      const selection = {
        rootKind: root.rootKind,
        rootId: root.rootId,
        operationId: operation.operation.operationId,
        sourceDigest: hashSyncText(operation.operationText),
      };
      await current();
      if ((await readRetainedNativeRoots(root)).length) {
        await requireCovered(root, selection.operationId);
      } else {
        await receiveSelectedCatalogRoot({
          remote: args.remote,
          catalog,
          scope: plan.binding,
          authorization: plan.authorization,
          selection,
          preserveNative: true,
          signal: args.signal,
          downloadAllowance: args.downloadAllowance,
        });
        await current();
        await requireCovered(root, selection.operationId);
      }
      covered.set(syncCatalogRootKey(root.rootKind, root.rootId), {
        root: selection,
        operationId: selection.operationId,
      });
    }
    await current();
    await prepareMediaHubBackupRootsFromLibraryV6(options, {
      requireSelected: options.scope === 'selected',
      prepareRoot: async (root) => {
        await current();
        const evidence = covered.get(syncCatalogRootKey(root.rootKind, root.rootId));
        if (evidence) await requireCovered(root, evidence.operationId);
        await current();
        await prepareNativeEditingRoot({
          root,
          purpose: 'backup',
          binding: plan.binding,
          authorization: plan.authorization,
          remote: args.remote,
          signal: args.signal,
          downloadAllowance: args.downloadAllowance,
        });
        await current();
      },
    });
    for (const evidence of covered.values())
      await requireCovered(evidence.root, evidence.operationId);
    await current();
  });
}
