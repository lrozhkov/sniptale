import type {
  SyncConnectionIdentity,
  SyncConnectionScope,
} from '../../composition/persistence/remote-connection/model';
import {
  captureRootKey,
  type CaptureOperationHeader,
  type PreparedCaptureOperation,
} from '../../composition/persistence/sync-capture/contracts';
import {
  commitConflictResolution,
  loadConflictResolutionContext,
} from '../../composition/persistence/sync-capture/conflict-resolution';
import type { SyncRemoteSelection } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { parseSyncRemoteSelection } from '../../contracts/messaging/contracts/runtime/sync-product';
import { connectionUuid } from '../../composition/persistence/remote-connection/model';
import type { scanSyncCatalog } from './catalog';
import { syncCatalogRootKey } from './catalog-graph';
import { createSyncAttempt, hashSyncText, parseSyncOperationText } from './wire-record';
import { parsePortableSyncRoot } from './prepared-root';

type Catalog = Awaited<ReturnType<typeof scanSyncCatalog>>;
function changed(): never {
  throw Object.assign(new Error('Conflict selection changed.'), { code: 'selection-changed' });
}
function sameHeads(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    [...left].sort().every((id, index) => id === [...right].sort()[index])
  );
}
function isAncestor(catalog: Catalog, candidate: string, heads: readonly string[]) {
  const pending = [...heads];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === candidate) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(catalog.operations.get(id)?.operation.parents ?? []));
  }
  return false;
}

/** Enqueue a chosen immutable version over exact heads, without downloading its file bodies. */
export async function resolveCatalogConflict(args: {
  catalog: Catalog;
  scope: SyncConnectionScope;
  authorization: SyncConnectionIdentity;
  selection: SyncRemoteSelection;
  expectedHeads: readonly string[];
  operationId: string;
}) {
  const selection = parseSyncRemoteSelection(structuredClone(args.selection));
  const heads = [...args.expectedHeads].sort();
  if (
    !selection ||
    !connectionUuid(args.operationId) ||
    heads.length < 2 ||
    heads.length > 32 ||
    heads.some((id) => typeof id !== 'string' || !id || id.length > 256) ||
    new Set(heads).size !== heads.length ||
    !heads.includes(selection.operationId)
  )
    changed();
  const catalog = structuredClone(args.catalog);
  const selected = catalog.operations.get(selection.operationId);
  if (
    !selected ||
    selected.operation.rootKind !== selection.rootKind ||
    selected.operation.rootId !== selection.rootId ||
    hashSyncText(selected.operationText) !== selection.sourceDigest
  )
    changed();
  const logical = await parseSyncOperationText(
    JSON.stringify({
      ...selected.operation,
      operationId: args.operationId,
      kind: selected.operation.kind === 'delete' ? 'delete' : 'restore',
      parents: heads,
    })
  );
  const recordText = JSON.stringify(logical);
  const attempt = selected.attempts.find(
    (candidate) =>
      candidate.operationText === selected.operationText &&
      !catalog.invalid.some((invalid) => invalid.key === candidate.recordKey)
  );
  if (!attempt) changed();
  const retained = await createSyncAttempt(recordText, crypto.randomUUID(), attempt.objects);
  const sourceSha256 = hashSyncText(recordText);
  const identity = {
    scope: args.scope,
    authorization: args.authorization,
    rootKind: selection.rootKind,
    rootId: selection.rootId,
    operationId: args.operationId,
  };
  const context = await loadConflictResolutionContext(identity);
  if (context.existing) {
    if (context.existing.sourceSha256 !== sourceSha256) changed();
    return context.existing;
  }
  const root = catalog.roots.get(syncCatalogRootKey(selection.rootKind, selection.rootId));
  if (
    catalog.invalid.length ||
    !root ||
    !root.conflict ||
    root.blocked ||
    !sameHeads(root.heads, heads) ||
    context.basis.some((id) => !isAncestor(catalog, id, heads))
  )
    changed();
  let changeKind: CaptureOperationHeader['source']['changeKind'] = 'tombstone';
  let label = selection.rootId;
  if (logical.envelope) {
    const portable = await parsePortableSyncRoot(logical.envelope, logical.reviewSourceMediaId);
    changeKind = portable.kind;
    label =
      portable.kind === 'video-project'
        ? portable.entry.project.name
        : portable.kind === 'scenario-project'
          ? portable.name
          : portable.metadata.entry.filename;
  }
  const operation: PreparedCaptureOperation = {
    version: 1,
    kind: 'sync-operation',
    phase: 'prepared',
    key: JSON.stringify(['resolution', args.scope.spaceId, args.operationId]),
    createdAt: Date.now(),
    ...args.scope,
    rootKind: selection.rootKind,
    rootId: selection.rootId,
    rootKey: captureRootKey(args.scope.spaceId, selection.rootKind, selection.rootId),
    generation: context.generation + 1,
    operationId: args.operationId,
    basis: heads,
    origin: 'local-restore',
    publicationId: null,
    sourceSha256,
    source: { changeKind, label: label.trim() || selection.rootId },
    prepared: {
      recordText,
      recordSha256: hashSyncText(recordText),
      objects: [],
      retainedObjects: retained.objects,
    },
  };
  return commitConflictResolution({
    ...identity,
    expectedGeneration: context.generation,
    expectedBasis: context.basis,
    operation,
  });
}
