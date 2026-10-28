import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  SyncConnectionIdentity,
  SyncConnectionScope,
} from '../../composition/persistence/remote-connection/model';
import {
  loadCatalogNativeBases,
  loadCatalogReplicaAdmission,
} from '../../composition/persistence/sync-capture/catalog-admission';
import { applyCatalogDeletion } from './incoming';
import { receiveSelectedCatalogRoot } from './incoming-selected';
import { syncCatalogRootKey } from './catalog-graph';
import { hashSyncText } from './wire-record';
import type { scanSyncCatalog } from './catalog';
import type { SyncRemoteStore } from './remote-store';

type Catalog = Awaited<ReturnType<typeof scanSyncCatalog>>;
const logger = createLogger({ namespace: 'SyncIncoming' });

function descendsFrom(catalog: Catalog, head: string, basis: readonly string[]): boolean {
  if (basis.length !== 1) return false;
  const pending = [head];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === basis[0]) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(catalog.operations.get(id)?.operation.parents ?? []));
  }
  return false;
}

/** One disposable continuation advances independent clean roots through existing native publishers. */
export function createAutomaticCatalogSync() {
  let binding: string | null = null;
  let afterRootKey: string | null = null;
  return {
    async run(args: {
      scope: SyncConnectionScope;
      authorization: SyncConnectionIdentity;
      remote: SyncRemoteStore;
      catalog: Catalog;
      signal: AbortSignal;
    }): Promise<{ applied: number; deferred: number; remaining: boolean }> {
      const selected = structuredClone({ scope: args.scope, authorization: args.authorization });
      const currentBinding = JSON.stringify(selected);
      if (binding !== currentBinding) {
        binding = currentBinding;
        afterRootKey = null;
      }
      const catalog = structuredClone(args.catalog);
      const result = { applied: 0, deferred: 0, remaining: false };
      args.signal.throwIfAborted();
      if (catalog.invalid.length) return result;
      const roots = [...catalog.roots.values()].sort((left, right) => {
        const a = syncCatalogRootKey(left.rootKind, left.rootId);
        const b = syncCatalogRootKey(right.rootKind, right.rootId);
        return a < b ? -1 : a === b ? 0 : 1;
      });
      const bases = await loadCatalogNativeBases({
        ...selected,
        roots: roots.map(({ rootKind, rootId }) => ({ rootKind, rootId })),
      });
      const materialized = new Map(
        bases.map((base) => [syncCatalogRootKey(base.rootKind, base.rootId), base])
      );
      for (const root of roots) {
        args.signal.throwIfAborted();
        const key = syncCatalogRootKey(root.rootKind, root.rootId);
        if (afterRootKey !== null && key <= afterRootKey) continue;
        const local = materialized.get(key);
        const head = root.heads[0];
        if (
          !local ||
          !head ||
          root.heads.length !== 1 ||
          root.conflict ||
          root.blocked ||
          root.unavailableDependencies.length ||
          local.basis[0] === head ||
          !descendsFrom(catalog, head, local.basis)
        )
          continue;
        const source = catalog.operations.get(head);
        if (!source) continue;
        if (result.applied + result.deferred >= 2) {
          result.remaining = true;
          return result;
        }
        try {
          if (source.operation.kind === 'delete') {
            const admission = await loadCatalogReplicaAdmission({
              ...selected,
              rootKind: root.rootKind,
              rootId: root.rootId,
              dependencyMediaIds: [],
            });
            // A native write after selection is a refusal, not permission to delete its newer state.
            if (
              admission.expectedLocalGeneration !== local.generation ||
              JSON.stringify(admission.expectedBasis) !== JSON.stringify(local.basis)
            )
              throw new Error('Incoming native basis changed.');
            await applyCatalogDeletion({
              catalog,
              rootKind: root.rootKind,
              rootId: root.rootId,
              admission,
              signal: args.signal,
            });
          } else {
            await receiveSelectedCatalogRoot({
              ...selected,
              remote: args.remote,
              catalog,
              selection: {
                rootKind: root.rootKind,
                rootId: root.rootId,
                operationId: head,
                sourceDigest: hashSyncText(source.operationText),
              },
              signal: args.signal,
            });
          }
          result.applied += 1;
          logger.info('Sync incoming operation applied', {
            rootRef: hashSyncText(JSON.stringify([selected.scope.spaceId, key])),
          });
        } catch {
          args.signal.throwIfAborted();
          result.deferred += 1;
          logger.warn('Sync incoming operation deferred', {
            rootRef: hashSyncText(JSON.stringify([selected.scope.spaceId, key])),
          });
        }
        afterRootKey = key;
      }
      afterRootKey = null;
      return result;
    },
  };
}
