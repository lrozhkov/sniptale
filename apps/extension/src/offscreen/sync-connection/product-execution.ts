import { prepareLibraryBackupInRuntime } from '../../workflows/sync-transfer/retained-library';
import {
  parseSyncStoragePolicy,
  sameSyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { SyncRemoteError } from '../../workflows/sync-transfer/remote-store';
import type { createPublishedOutgoingRetirement } from '../../workflows/sync-transfer/outgoing-retirement';
import {
  readCurrentExecutionConnection,
  createExecutionRemoteStore,
  type SyncExecutionCredentials,
} from './connection-admission';
import { createLogger } from '@sniptale/platform/observability/logger';
import { releaseNativeEditingRoot } from '../../workflows/sync-transfer/native-cache';
import { trimNativeCache } from '../../workflows/sync-transfer/native-cache-policy';
import { indexCatalogCopies } from '../../workflows/sync-transfer/residency-copy';
import {
  prepareNativeEditingRoot,
  prepareNativeScenarioExport,
  createSyncDownloadAllowance,
  isNativeEditingRootReady,
} from '../../workflows/sync-transfer/native-residency';
import type { createAutomaticCatalogSync } from '../../workflows/sync-transfer/automatic';
import { resolveCatalogConflict } from '../../workflows/sync-transfer/conflict-resolution';
import { readSyncProductThumbnail } from './product-thumbnail';
import type {
  SyncExecutorBinding,
  SyncCredentialLease,
  SyncProductCompletion,
  SyncProductFailureCode,
  SyncProductWork,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncConnectionRequests } from '../../workflows/sync-transfer/connection-requests';
import type { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import { verifySyncWorkspaceIdentity } from '../../workflows/sync-transfer/workspace';
import { readCheckedPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-view';
import type { scanSyncCatalog } from '../../workflows/sync-transfer/catalog';
import { refreshPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-refresh';
import { receiveSelectedCatalogRoot } from '../../workflows/sync-transfer/incoming-selected';
import { syncCatalogRootKey } from '../../workflows/sync-transfer/catalog-graph';
import { hashSyncText } from '../../workflows/sync-transfer/wire-record';
import { offscreenDataReadiness } from '../runtime/data-readiness';

const logger = createLogger({ namespace: 'SyncProduct' });

// One bounded checked metadata snapshot; it grants no physical integrity or native write authority.
let thumbnailCatalog: {
  bindingKey: string;
  catalog: Promise<Awaited<ReturnType<typeof scanSyncCatalog>> | null>;
} | null = null;

export interface SyncProductExecutionInput extends SyncExecutorBinding {
  credentialLease?: SyncCredentialLease;
  work: SyncProductWork;
  signal: AbortSignal;
}
export interface SyncProductExecutionResult {
  state: 'ready' | 'failed' | 'interrupted';
  failureCode: SyncProductFailureCode | null;
  completion: SyncProductCompletion | null;
  containment: 'contained' | 'unsafe';
}
function failure(error: unknown, signal: AbortSignal): SyncProductFailureCode {
  if (signal.aborted)
    return signal.reason instanceof SyncRemoteError && signal.reason.code === 'secrets-locked'
      ? 'secrets-locked'
      : 'interrupted';
  if (error instanceof Error && 'code' in error) {
    switch (error.code) {
      case 'secrets-locked':
        return 'secrets-locked';
      case 'authentication':
        return 'authentication';
      case 'access-denied':
        return 'access-denied';
      case 'storage-full':
        return 'storage-full';
      case 'missing':
      case 'unavailable':
        return 'unavailable';
      case 'transport':
      case 'temporary':
        return 'temporary';
      case 'selection-changed':
        return 'selection-changed';
    }
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'storage-full';
  return 'invalid-data';
}

async function loadProductCatalog(
  remote: Awaited<ReturnType<typeof createWebdavRemoteStore>>,
  selection: SyncExecutorBinding,
  work: SyncProductWork,
  signal: AbortSignal
) {
  const bindingKey = JSON.stringify(selection);
  let catalog;
  if (work.kind === 'thumbnail-read') {
    if (!thumbnailCatalog || thumbnailCatalog.bindingKey !== bindingKey)
      thumbnailCatalog = { bindingKey, catalog: readCheckedPersistedSyncCatalog() };
    catalog = await thumbnailCatalog.catalog;
    if (!catalog?.operations.has(work.selection.operationId)) {
      thumbnailCatalog = { bindingKey, catalog: readCheckedPersistedSyncCatalog() };
      catalog = await thumbnailCatalog.catalog;
    }
    if (!catalog) throw new Error('Sync thumbnail metadata unavailable');
  } else {
    catalog = await refreshPersistedSyncCatalog(
      remote,
      selection.scope.spaceId,
      selection.scope.connectionGeneration,
      signal,
      { bypassCache: work.kind === 'catalog-refresh' && work.bypassCache }
    );
    thumbnailCatalog = { bindingKey, catalog: Promise.resolve(catalog) };
  }
  return catalog;
}

function checkedSelectedCatalogOperation(
  catalog: Awaited<ReturnType<typeof scanSyncCatalog>>,
  work: Exclude<
    SyncProductWork,
    {
      kind:
        | 'catalog-refresh'
        | 'automatic-sync'
        | 'native-prepare'
        | 'native-release'
        | 'cache-trim'
        | 'backup-prepare'
        | 'library-backup-prepare'
        | 'scenario-export-prepare';
    }
  >
) {
  const selected = work.selection;
  const root = catalog.roots.get(syncCatalogRootKey(selected.rootKind, selected.rootId));
  const operation = catalog.operations.get(selected.operationId);
  if (
    !operation ||
    hashSyncText(operation.operationText) !== selected.sourceDigest ||
    (work.kind === 'replica-prepare' &&
      (catalog.invalid.length ||
        !root ||
        root.deleted ||
        root.blocked ||
        root.conflict ||
        root.heads.length !== 1 ||
        root.heads[0] !== selected.operationId))
  )
    throw Object.assign(new Error('Sync selection changed'), { code: 'selection-changed' });
  return operation;
}

/** One finite catalog/replica/thumbnail operation uses the existing connection request lifetime. */
export function createSyncProductExecution(
  input: SyncProductExecutionInput,
  hasOriginPermission: (origin: string) => Promise<boolean>,
  onLibraryChanged: () => void = () => undefined,
  onQueueAvailable: (operationId: string) => void = () => undefined,
  automatic?: ReturnType<typeof createAutomaticCatalogSync>,
  retirement?: ReturnType<typeof createPublishedOutgoingRetirement>,
  credentials?: SyncExecutionCredentials
) {
  const selection = structuredClone({ scope: input.scope, authorization: input.authorization });
  const work = structuredClone(input.work);
  const downloadAllowance =
    work.kind === 'native-prepare' ||
    work.kind === 'backup-prepare' ||
    work.kind === 'library-backup-prepare' ||
    work.kind === 'scenario-export-prepare' ||
    work.kind === 'replica-prepare'
      ? createSyncDownloadAllowance()
      : undefined;
  const { signal } = input;
  function event(
    state: 'started' | 'ready' | 'failed' | 'interrupted',
    code: SyncProductFailureCode | null = null
  ): void {
    if (work.kind === 'thumbnail-read') return;
    try {
      const details = { kind: work.kind, state, code };
      const message = `sync.product.${state} kind=${work.kind} code=${code ?? 'none'}`;
      if (state === 'failed' || state === 'interrupted') logger.warn(message, details);
      else logger.info(message, details);
    } catch {
      // Diagnostics cannot change native work or containment results.
    }
  }

  function notifyLibraryChanged(): void {
    try {
      onLibraryChanged();
    } catch {
      // Advisory UI refresh cannot change a completed native publication.
    }
  }
  const requests = createSyncConnectionRequests({
    identity: selection.authorization,
    hasOriginPermission,
    ...(credentials ? { checkProtection: credentials.checkProtection } : {}),
  });
  async function current() {
    const connection = await readCurrentExecutionConnection(selection, signal);
    if (!connection) throw new Error('Sync product authorization refused');
    if (
      work.kind === 'library-backup-prepare' &&
      !sameSyncConnectionIdentity(connection.identity, work.expected)
    )
      throw Object.assign(new Error('Library backup connection changed.'), {
        code: 'selection-changed',
      });
    return connection;
  }
  async function executeWork(
    remote: Awaited<ReturnType<typeof createWebdavRemoteStore>>,
    catalog: Awaited<ReturnType<typeof scanSyncCatalog>> | null
  ): Promise<SyncProductCompletion> {
    if (work.kind === 'library-backup-prepare') {
      if (!catalog || !downloadAllowance)
        throw new Error('Library backup admission is unavailable.');
      const connection = await current();
      try {
        await prepareLibraryBackupInRuntime({
          catalog,
          binding: connection.binding,
          authorization: selection.authorization,
          expected: work.expected,
          options: work.options,
          remote,
          signal,
          downloadAllowance,
        });
        await current();
      } finally {
        notifyLibraryChanged();
      }
      return { kind: 'library-backup', expected: work.expected, options: work.options };
    }
    if (work.kind === 'scenario-export-prepare') {
      const connection = await current();
      try {
        await prepareNativeScenarioExport({
          projectId: work.projectId,
          exportId: work.exportId,
          binding: connection.binding,
          authorization: selection.authorization,
          remote,
          signal,
          ...(downloadAllowance ? { downloadAllowance } : {}),
        });
      } finally {
        notifyLibraryChanged();
      }
      return { kind: 'scenario-export', projectId: work.projectId, exportId: work.exportId };
    }
    if (work.kind === 'native-prepare' || work.kind === 'backup-prepare') {
      const connection = await current();
      try {
        await prepareNativeEditingRoot({
          root: work.root,
          purpose: work.kind === 'backup-prepare' ? 'backup' : 'editing',
          ...(downloadAllowance ? { downloadAllowance } : {}),
          remote,
          binding: connection.binding,
          authorization: selection.authorization,
          signal,
        });
      } finally {
        notifyLibraryChanged();
      }
      return { kind: 'native', root: work.root };
    }
    if (!catalog) throw new Error('Sync product catalog unavailable.');
    if (work.kind === 'native-release' || work.kind === 'cache-trim') {
      const connection = await current();
      const args = {
        binding: connection.binding,
        authorization: selection.authorization,
        index: indexCatalogCopies(catalog, selection.scope.spaceId),
        remote,
        signal,
      };
      try {
        return work.kind === 'native-release'
          ? {
              kind: 'native-release',
              root: work.root,
              result: await releaseNativeEditingRoot({ ...args, root: work.root }),
            }
          : { kind: 'cache-trim', result: await trimNativeCache(args) };
      } finally {
        notifyLibraryChanged();
      }
    }
    if (work.kind === 'automatic-sync') {
      if (!automatic) throw new Error('Automatic sync execution unavailable.');
      const connection = await current();
      const policy = parseSyncStoragePolicy(
        connection.storagePolicy === undefined
          ? { version: 1, mode: 'on-demand' }
          : connection.storagePolicy
      );
      if (!policy) throw new Error('Automatic sync storage policy is unavailable.');
      const result = await automatic.run({
        ...selection,
        remote,
        catalog,
        signal,
        binaryAdmission: 'resident',
      });
      if (result.applied > 0) notifyLibraryChanged();
      return { kind: 'automatic', ...result };
    }
    if (work.kind === 'catalog-refresh') return { kind: 'catalog', count: catalog.roots.size };
    const selected = work.selection;
    const operation = checkedSelectedCatalogOperation(catalog, work);
    if (work.kind === 'conflict-resolve') {
      const accepted = await resolveCatalogConflict({
        catalog,
        ...selection,
        selection: selected,
        expectedHeads: work.expectedHeads,
        operationId: work.resolutionId,
      });
      try {
        onQueueAvailable(accepted.operationId);
      } catch {
        /* The durable queue survives a missed wakeup. */
      }
      return { kind: 'resolution', operationId: accepted.operationId };
    }
    if (work.kind === 'replica-prepare') {
      const committed = await receiveSelectedCatalogRoot({
        remote,
        catalog,
        ...selection,
        selection: selected,
        signal,
        ...(work.preserveNative ? { preserveNative: true as const } : {}),
        ...(downloadAllowance ? { downloadAllowance } : {}),
      });
      const root = { rootKind: committed.rootKind, rootId: committed.rootId };
      try {
        const connection = await current();
        await prepareNativeEditingRoot({
          root,
          remote,
          ...(downloadAllowance ? { downloadAllowance } : {}),
          binding: connection.binding,
          authorization: selection.authorization,
          signal,
        });
      } catch (error) {
        // A completed native commit wins late cancellation only when all editing bytes are already available.
        if (!signal.aborted || !(await isNativeEditingRootReady(root))) throw error;
      } finally {
        notifyLibraryChanged();
      }
      return { kind: 'replica', selection: { ...selected, ...committed } };
    }
    const thumbnail = await readSyncProductThumbnail(remote, operation, signal);
    await current();
    return thumbnail;
  }
  return {
    drain() {
      thumbnailCatalog = null;
      return requests.close();
    },
    async run(): Promise<SyncProductExecutionResult> {
      let outcome: Omit<SyncProductExecutionResult, 'containment'>;
      event('started');
      try {
        signal.throwIfAborted();
        await offscreenDataReadiness.ensureAssets();
        const connection = await current();
        const remote = await createExecutionRemoteStore(
          connection,
          requests.request,
          credentials,
          signal
        );
        if (connection.workspace)
          await verifySyncWorkspaceIdentity(remote, connection.workspace, signal);
        await current();
        if (work.kind === 'automatic-sync' && retirement) {
          await retirement.run({ ...selection, remote, signal });
          await current();
        }
        const catalog =
          work.kind === 'native-prepare' ||
          work.kind === 'backup-prepare' ||
          work.kind === 'scenario-export-prepare'
            ? null
            : await loadProductCatalog(remote, selection, work, signal);
        if (catalog && work.kind !== 'thumbnail-read') notifyLibraryChanged();
        await current();
        const completion = await executeWork(remote, catalog);
        outcome = { state: 'ready', failureCode: null, completion };
      } catch (error) {
        const failureCode = failure(error, signal);
        outcome = {
          state: failureCode === 'interrupted' ? 'interrupted' : 'failed',
          failureCode,
          completion: null,
        };
      }
      try {
        await requests.close();
        event(outcome.state, outcome.failureCode);
        return { ...outcome, containment: 'contained' };
      } catch {
        event('failed', 'internal');
        return { ...outcome, containment: 'unsafe' };
      }
    },
  };
}
