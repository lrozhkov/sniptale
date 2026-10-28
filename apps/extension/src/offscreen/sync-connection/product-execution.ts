import { readSyncProductThumbnail } from './product-thumbnail';
import {
  loadSyncConnection,
  loadSyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import type {
  SyncExecutorBinding,
  SyncProductCompletion,
  SyncProductFailureCode,
  SyncProductWork,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncConnectionRequests } from '../../workflows/sync-transfer/connection-requests';
import { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import { verifySyncWorkspaceIdentity } from '../../workflows/sync-transfer/workspace';
import { readCheckedPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-view';
import type { scanSyncCatalog } from '../../workflows/sync-transfer/catalog';
import { refreshPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-refresh';
import { receiveSelectedCatalogRoot } from '../../workflows/sync-transfer/incoming-selected';
import { syncCatalogRootKey } from '../../workflows/sync-transfer/catalog-graph';
import { hashSyncText } from '../../workflows/sync-transfer/wire-record';
import { offscreenDataReadiness } from '../runtime/data-readiness';

// One bounded checked metadata snapshot; it grants no physical integrity or native write authority.
let thumbnailCatalog: {
  bindingKey: string;
  catalog: Promise<Awaited<ReturnType<typeof scanSyncCatalog>> | null>;
} | null = null;

export interface SyncProductExecutionInput extends SyncExecutorBinding {
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
  if (signal.aborted) return 'interrupted';
  if (error instanceof Error && 'code' in error) {
    switch (error.code) {
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
  work: Exclude<SyncProductWork, { kind: 'catalog-refresh' }>
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
  hasOriginPermission: (origin: string) => Promise<boolean>
) {
  const selection = structuredClone({ scope: input.scope, authorization: input.authorization });
  const work = structuredClone(input.work);
  const { signal } = input;
  const requests = createSyncConnectionRequests({
    identity: selection.authorization,
    hasOriginPermission,
  });
  async function current() {
    signal.throwIfAborted();
    const connection = await loadSyncConnection();
    if (
      !connection ||
      connection.phase !== 'active' ||
      !sameConnectionScope(connection.binding, selection.scope) ||
      !sameSyncConnectionIdentity(connection.identity, selection.authorization)
    )
      throw new Error('Sync product authorization refused');
    signal.throwIfAborted();
    return connection;
  }
  return {
    drain() {
      thumbnailCatalog = null;
      return requests.close();
    },
    async run(): Promise<SyncProductExecutionResult> {
      let outcome: Omit<SyncProductExecutionResult, 'containment'>;
      try {
        signal.throwIfAborted();
        await offscreenDataReadiness.ensureAssets();
        const connection = await current();
        const remote = await createWebdavRemoteStore(
          {
            rootUrl: connection.binding.rootUrl,
            authentication: () => loadSyncConnectionAuthentication(selection.authorization),
            request: requests.request,
          },
          signal
        );
        if (connection.workspace)
          await verifySyncWorkspaceIdentity(remote, connection.workspace, signal);
        await current();
        const catalog = await loadProductCatalog(remote, selection, work, signal);
        await current();
        let completion: SyncProductCompletion;
        if (work.kind === 'catalog-refresh')
          completion = { kind: 'catalog', count: catalog.roots.size };
        else {
          const selected = work.selection;
          const operation = checkedSelectedCatalogOperation(catalog, work);
          if (work.kind === 'replica-prepare') {
            const committed = await receiveSelectedCatalogRoot({
              remote,
              catalog,
              ...selection,
              selection: selected,
              signal,
            });
            // A committed native root wins an abort racing the final commit; the caller must not promise rollback.
            completion = { kind: 'replica', selection: { ...selected, ...committed } };
          } else {
            const thumbnail = await readSyncProductThumbnail(remote, operation, signal);
            await current();
            completion = thumbnail;
          }
        }
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
        return { ...outcome, containment: 'contained' };
      } catch {
        return { ...outcome, containment: 'unsafe' };
      }
    },
  };
}
