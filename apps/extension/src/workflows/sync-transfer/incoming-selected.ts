import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { isNativeEditingRootReady, prepareNativeEditingRoot } from './native-residency';
import type { CaptureRootKind } from '../../composition/persistence/sync-capture/contracts';
import type {
  SyncConnectionIdentity,
  SyncConnectionScope,
} from '../../composition/persistence/remote-connection/model';
import {
  loadCatalogReplicaAdmission,
  hasCatalogReplicaReceipt,
  loadMaterializedCatalogSelections,
} from '../../composition/persistence/sync-capture/catalog-admission';
import { publishPreparedReplicaJournal } from '../../composition/persistence/sync-capture/replica-publication';
import {
  cancelAssetPublication,
  publishReadyJournalWithRetry,
  SupersededAssetPublicationError,
} from '../../composition/persistence/assets/publication';
import { runWithDurableAssetLifecycleLock } from '../../composition/persistence/infrastructure/mutation-barrier';
import { prepareCatalogReplica } from './incoming';
import {
  syncCatalogRootKey,
  resolveSyncScenarioDependency,
  type CatalogOperation,
} from './catalog-graph';
import type { scanSyncCatalog } from './catalog';
import type { SyncRemoteStore } from './remote-store';
import { hashSyncText } from './wire-record';

type Catalog = Awaited<ReturnType<typeof scanSyncCatalog>>;

/** One live catalog head pinned by the native Library projection. */
export interface SelectedCatalogRoot {
  rootKind: CaptureRootKind;
  rootId: string;
  operationId: string;
  sourceDigest: string;
}

function checkedHead(catalog: Catalog, selection: SelectedCatalogRoot): CatalogOperation {
  const root = catalog.roots.get(syncCatalogRootKey(selection.rootKind, selection.rootId));
  const selected = catalog.operations.get(selection.operationId);
  if (
    catalog.invalid.length ||
    !root ||
    root.deleted ||
    root.blocked ||
    root.conflict ||
    root.heads.length !== 1 ||
    root.heads[0] !== selection.operationId ||
    root.unavailableDependencies.length ||
    !selected ||
    selected.operation.rootKind !== selection.rootKind ||
    selected.operation.rootId !== selection.rootId ||
    selected.operation.kind === 'delete' ||
    hashSyncText(selected.operationText) !== selection.sourceDigest
  )
    throw new Error('Selected incoming catalog root changed or is unavailable.');
  return selected;
}

function dependencyOrder(catalog: Catalog, selected: SelectedCatalogRoot): SelectedCatalogRoot[] {
  const ordered: SelectedCatalogRoot[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(selection: SelectedCatalogRoot) {
    const key = syncCatalogRootKey(selection.rootKind, selection.rootId);
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error('Incoming catalog dependency cycle.');
    visiting.add(key);
    const operation = checkedHead(catalog, selection);
    for (const dependency of operation.operation.dependencies) {
      const root = catalog.roots.get(syncCatalogRootKey('media', dependency.mediaId));
      const operationId = root?.heads[0];
      const source = operationId ? catalog.operations.get(operationId) : undefined;
      if (!source) throw new Error('Incoming media dependency is unavailable.');
      visit({
        rootKind: 'media',
        rootId: dependency.mediaId,
        operationId: source.operation.operationId,
        sourceDigest: hashSyncText(source.operationText),
      });
    }
    for (const dependency of operation.operation.rootDependencies ?? []) {
      const root = catalog.roots.get(syncCatalogRootKey(dependency.rootKind, dependency.rootId));
      const operationId = root?.heads[0];
      const source = operationId ? catalog.operations.get(operationId) : undefined;
      if (
        !root ||
        !source ||
        !resolveSyncScenarioDependency(
          catalog.operations,
          dependency.rootId,
          dependency.childIds,
          dependency.basis,
          root.heads
        )
      )
        throw new Error('Incoming Scenario dependency is unavailable.');
      visit({
        rootKind: dependency.rootKind,
        rootId: dependency.rootId,
        operationId: source.operation.operationId,
        sourceDigest: hashSyncText(source.operationText),
      });
    }
    visiting.delete(key);
    visited.add(key);
    ordered.push(selection);
  }
  visit(selected);
  return ordered;
}

/** A completed receipt does not establish local availability for a parent receive. */
async function prepareReceivedDependency(
  args: Parameters<typeof receiveSelectedCatalogRoot>[0],
  root: SelectedCatalogRoot
): Promise<void> {
  if (await isNativeEditingRootReady(root)) return;
  if (args.residentOnly) throw new Error('Background incoming requires resident dependencies.');
  args.signal.throwIfAborted();
  const connection = await loadSyncConnection();
  if (
    !connection ||
    connection.phase !== 'active' ||
    !sameConnectionScope(connection.binding, args.scope) ||
    !sameSyncConnectionIdentity(connection.identity, args.authorization)
  )
    throw new Error('Incoming dependency authorization changed.');
  await prepareNativeEditingRoot({
    root,
    binding: connection.binding,
    authorization: args.authorization,
    remote: args.remote,
    signal: args.signal,
  });
}

/** Open one pinned root, committing its media dependencies before target-owned parent admission. */
export async function receiveSelectedCatalogRoot(args: {
  remote: SyncRemoteStore;
  catalog: Catalog;
  scope: SyncConnectionScope;
  authorization: SyncConnectionIdentity;
  selection: SelectedCatalogRoot;
  residentOnly?: true;
  preserveNative?: true;
  signal: AbortSignal;
}): Promise<{ rootKind: CaptureRootKind; rootId: string; operationId: string }> {
  await initDB();
  return runWithAssetResourceRead(async () => {
    const catalog = structuredClone(args.catalog);
    const scope = structuredClone(args.scope);
    const authorization = structuredClone(args.authorization);
    const selection = structuredClone(args.selection);
    const ordered = dependencyOrder(catalog, selection);
    for (const root of ordered) {
      args.signal.throwIfAborted();
      const source = checkedHead(catalog, root);
      const receipt = () => hasCatalogReplicaReceipt({ scope, ...root });
      const alreadyCurrent =
        args.preserveNative &&
        (
          await loadMaterializedCatalogSelections({
            scope,
            selections: [root],
          })
        ).length === 1;
      if (alreadyCurrent || (await receipt())) {
        if (root.operationId === selection.operationId)
          return {
            rootKind: selection.rootKind,
            rootId: selection.rootId,
            operationId: selection.operationId,
          };
        await prepareReceivedDependency(args, root);
        continue;
      }
      const admission = await loadCatalogReplicaAdmission({
        scope,
        authorization,
        rootKind: root.rootKind,
        rootId: root.rootId,
        dependencyMediaIds: source.operation.dependencies.map((dependency) => dependency.mediaId),
        dependencyRoots: (source.operation.rootDependencies ?? []).map((dependency) => {
          const root = catalog.roots.get(
            syncCatalogRootKey(dependency.rootKind, dependency.rootId)
          );
          if (
            !root ||
            !resolveSyncScenarioDependency(
              catalog.operations,
              dependency.rootId,
              dependency.childIds,
              dependency.basis,
              root.heads
            )
          )
            throw new Error('Incoming Scenario dependency changed.');
          return { ...dependency, basis: [...root.heads] };
        }),
      });
      // First-enrollment publishers repeat absence inside their atomic native transaction.
      // Existing predecessors need an explicit normal receive, never a full-backup side effect.
      if (
        args.preserveNative &&
        (admission.expectedLocalGeneration !== 0 || admission.expectedWorkspaceRevision !== null)
      )
        throw new Error('Library backup preserves existing native revisions.');
      args.signal.throwIfAborted();
      const journal = await prepareCatalogReplica({
        remote: args.remote,
        catalog,
        rootKind: root.rootKind,
        rootId: root.rootId,
        admission,
        signal: args.signal,
        ...(args.residentOnly ? { residentOnly: true as const } : {}),
      });
      try {
        await publishReadyJournalWithRetry(journal, async (ready, permit) => {
          // Cancellation and publication use the same lifecycle exclusion as startup replay.
          if (args.signal.aborted && !(await receipt()))
            throw new SupersededAssetPublicationError();
          await publishPreparedReplicaJournal(ready, permit);
        });
      } catch (error) {
        if (!args.signal.aborted) throw error;
        const committed = await runWithDurableAssetLifecycleLock(async (permit) => {
          if (await receipt()) return true;
          if (!(error instanceof SupersededAssetPublicationError))
            await cancelAssetPublication(journal, permit);
          return false;
        });
        if (!committed) args.signal.throwIfAborted();
      }
      if (root.operationId === selection.operationId)
        return {
          rootKind: selection.rootKind,
          rootId: selection.rootId,
          operationId: selection.operationId,
        };
    }
    throw new Error('Selected incoming root was not committed.');
  });
}
