import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from '../../composition/persistence/projects/index.test-support';
import { runWithExclusivePersistenceMutationPermit } from '../../composition/persistence/infrastructure/mutation-barrier';
import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import {
  queueOperationKey,
  parseSyncQueueOperation,
} from '../../composition/persistence/sync-capture/queue-model';
import {
  authorization,
  scope,
  deferred,
  createReconciliationFixture,
} from '../../composition/persistence/sync-capture/queue-reconciliation.test-support';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { projectSyncCatalog, syncCatalogRootKey, type CatalogAttempt } from './catalog-graph';
import { dispatchPreparedOutgoing } from './outgoing';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { assertConflictResolutionCurrent } from '../../composition/persistence/sync-capture/conflict-resolution';
import { loadPreparedOutgoingOperation } from '../../composition/persistence/sync-capture/outgoing';
import { resolveCatalogConflict } from './conflict-resolution';
import { createSyncAttempt, hashSyncText, parseSyncOperationText } from './wire-record';

const io = vi.hoisted(() => ({ prepared: vi.fn(), initialize: vi.fn(), readOriginal: vi.fn() }));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  capturePreparedDatabase: io.prepared,
  initDB: io.initialize,
}));
vi.mock('../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: io.readOriginal,
}));
const rootId = 'project-asset:source';
const rootKey = captureRootKey(scope.spaceId, 'media', rootId);
const stateKey = JSON.stringify(['root-state', rootKey]);
const commandId = '10000000-0000-4000-8000-000000000001';
const binary = {
  objectId: 'sync-object-000001',
  path: '_sniptale/assets/sync-object-000001/original.png',
  filename: 'original.png',
  mimeType: 'image/png',
  size: 3,
};
type Catalog = Parameters<typeof resolveCatalogConflict>[0]['catalog'];
async function attempt(
  id: string,
  kind: 'edit' | 'delete' = 'edit',
  parents: string[] = []
): Promise<CatalogAttempt> {
  const envelope =
    kind === 'delete'
      ? null
      : parseRootEnvelope({
          descriptor: {
            rootKind: 'media',
            rootId,
            mediaSubtype: 'library-item',
            metadataPath: 'Metadata/sync-root.json',
            objectCount: 1,
            totalBytes: 3,
          },
          metadata: {
            entry: createMediaLibraryEntry({
              id: rootId,
              filename: `${id}.png`,
              source: { kind: 'project-asset', projectAssetId: 'source' },
              mimeType: 'image/png',
              size: 3,
              workspaceRevision: 0,
              lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 },
            }),
            originalObjectId: binary.objectId,
            projectAsset: { id: 'source', mimeType: 'image/png', size: 3, createdAt: 1 },
          },
          objects: [binary],
        });
  const operationText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: scope.spaceId,
    operationId: id,
    rootKind: 'media',
    rootId,
    kind,
    parents,
    dependencies: [],
    envelope,
    objects: kind === 'delete' ? [] : [{ objectId: binary.objectId, sha256: 'a'.repeat(64) }],
  });
  const operation = await parseSyncOperationText(operationText);
  return {
    ...(await createSyncAttempt(operationText, crypto.randomUUID())),
    operationText,
    operation,
  };
}
function catalog(records: CatalogAttempt[]): Catalog {
  return { ...projectSyncCatalog(scope.spaceId, records), invalid: [], metadataBytes: 0, pages: 1 };
}
async function setup(rightKind: 'edit' | 'delete' = 'edit') {
  const f = createReconciliationFixture();
  io.prepared.mockReturnValue(f.database);
  io.initialize.mockResolvedValue(f.database);
  const state = {
    version: 1,
    kind: 'root-state',
    key: stateKey,
    createdAt: 1,
    spaceId: scope.spaceId,
    rootKind: 'media',
    rootId,
    rootKey,
    generation: 4,
    basis: ['base'],
  };
  f.table('sync_capture').set(stateKey, state);
  const base = await attempt('base');
  const left = await attempt('left', 'edit', ['base']);
  const right = await attempt('right', rightKind, ['base']);
  const records = [base, left, right];
  const graph = catalog(records);
  function args(selected = left) {
    return {
      catalog: graph,
      scope,
      authorization,
      operationId: commandId,
      expectedHeads: ['left', 'right'],
      selection: {
        rootKind: 'media' as const,
        rootId,
        operationId: selected.operation.operationId,
        sourceDigest: hashSyncText(selected.operationText),
      },
    };
  }
  return { ...f, state, records, graph, left, right, args };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string) => ({ lower, upper, lowerOpen: false, upperOpen: false }),
  });
  io.readOriginal.mockRejectedValue(new Error('Originals are unavailable'));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Original bodies must not be downloaded');
    })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['edit', 'delete'] as const)(
  'resolves edit/%s by retaining the selected version over both exact heads without original reads',
  async (rightKind) => {
    const f = await setup(rightKind);
    expect(f.graph.roots.get(syncCatalogRootKey('media', rootId))).toMatchObject({
      heads: ['left', 'right'],
      conflict: true,
    });
    const originals = structuredClone(f.table('media_library'));
    const operation = await resolveCatalogConflict(f.args());
    if (operation.phase !== 'prepared') throw new Error('Expected prepared decision');
    const logical = await parseSyncOperationText(operation.prepared.recordText);
    expect(logical).toMatchObject({
      operationId: commandId,
      kind: 'restore',
      parents: ['left', 'right'],
      envelope: f.left.operation.envelope,
      objects: f.left.operation.objects,
    });
    expect(operation.prepared.objects).toEqual([]);
    expect(operation.prepared.retainedObjects).toEqual(f.left.objects);
    expect(JSON.stringify(operation)).not.toContain('"ref":');
    expect(f.table('asset_refs').size).toBe(0);
    expect(f.table('asset_owners').size).toBe(0);
    expect(f.table('media_library')).toEqual(originals);
    expect(f.table('sync_capture').get(stateKey)).toEqual(f.state);
    expect(
      parseSyncQueueOperation(f.table('sync_outbox').get(queueOperationKey(scope, commandId)))
    ).toMatchObject({ status: 'queued', operationId: commandId });
    const published = await createSyncAttempt(
      operation.prepared.recordText,
      crypto.randomUUID(),
      operation.prepared.retainedObjects
    );
    const resolvedGraph = catalog([
      ...f.records,
      { ...published, operationText: operation.prepared.recordText, operation: logical },
    ]);
    expect(resolvedGraph.roots.get(syncCatalogRootKey('media', rootId))).toMatchObject({
      heads: [commandId],
      conflict: false,
      deleted: false,
    });
    expect(resolvedGraph.operations.has('left')).toBe(true);
    expect(resolvedGraph.operations.has('right')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  }
);

it('resolves delete/edit to the selected deletion while retaining both histories', async () => {
  const f = await setup('delete');
  const operation = await resolveCatalogConflict(f.args(f.right));
  if (operation.phase !== 'prepared') throw new Error('Expected prepared deletion');
  const logical = await parseSyncOperationText(operation.prepared.recordText);
  expect(logical).toMatchObject({
    kind: 'delete',
    parents: ['left', 'right'],
    envelope: null,
    objects: [],
  });
  expect(operation.prepared).toMatchObject({ objects: [], retainedObjects: [] });
  const published = await createSyncAttempt(operation.prepared.recordText, crypto.randomUUID());
  const graph = catalog([
    ...f.records,
    { ...published, operationText: operation.prepared.recordText, operation: logical },
  ]);
  expect(graph.roots.get(syncCatalogRootKey('media', rootId))).toMatchObject({
    heads: [commandId],
    conflict: false,
    deleted: true,
  });
  expect(graph.operations.has('left') && graph.operations.has('right')).toBe(true);
  expect(f.table('sync_capture').get(stateKey)).toEqual(f.state);
  expect(fetch).not.toHaveBeenCalled();
});

it('replays one logical command after remote heads change without replacing its captured decision', async () => {
  const f = await setup();
  const first = await resolveCatalogConflict(f.args());
  const newer = await attempt('newer', 'edit', ['left']);
  const before = structuredClone(f.rows);
  expect(
    await resolveCatalogConflict({ ...f.args(), catalog: catalog([...f.records, newer]) })
  ).toEqual(first);
  expect(f.rows).toEqual(before);
});

it.each(['heads', 'digest', 'local-basis', 'blocked', 'invalid', 'duplicate-heads'] as const)(
  'refuses %s turnover before creating a resolution or queue row',
  async (kind) => {
    const f = await setup();
    const args = f.args();
    if (kind === 'heads')
      args.catalog = catalog([...f.records, await attempt('newer', 'edit', ['left'])]);
    if (kind === 'digest') args.selection.sourceDigest = 'f'.repeat(64);
    if (kind === 'local-basis')
      f.table('sync_capture').set(stateKey, {
        ...f.state,
        generation: 5,
        basis: ['unpublished-local'],
      });
    if (kind === 'blocked')
      args.catalog.roots.get(syncCatalogRootKey('media', rootId))!.blocked = true;
    if (kind === 'invalid')
      args.catalog.invalid.push({ key: 'invalid-manifest', code: 'invalid-manifest' });
    if (kind === 'duplicate-heads') args.expectedHeads = ['left', 'left'];
    const before = structuredClone(f.rows);
    await expect(resolveCatalogConflict(args)).rejects.toMatchObject({ code: 'selection-changed' });
    expect(f.rows).toEqual(before);
  }
);

it('preserves a native write accepted after decision observation and before queue admission', async () => {
  const f = await setup();
  const reached = deferred();
  const release = deferred();
  const blocker = runWithExclusivePersistenceMutationPermit(async () => {
    reached.resolve();
    await release.promise;
  });
  await reached.promise;
  const observed = deferred();
  const transaction = f.database.transaction.bind(f.database);
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = transaction(stores, mode);
    if (mode === 'readonly') observed.resolve();
    return tx;
  });
  const pending = resolveCatalogConflict(f.args());
  const refusal = expect(pending).rejects.toThrow('native selection changed');
  await observed.promise;
  // The read transaction has captured the previous generation, while native commit will reload it.
  f.table('sync_capture').set(stateKey, { ...f.state, generation: 5, basis: ['local-new'] });
  release.resolve();
  await blocker;
  await refusal;
  expect(f.table('sync_capture').get(stateKey)).toMatchObject({
    generation: 5,
    basis: ['local-new'],
  });
  expect(f.table('sync_outbox').has(queueOperationKey(scope, commandId))).toBe(false);
});

it('retries after an atomic native quota refusal with the same logical operation and retained mappings', async () => {
  const f = await setup();
  f.failNextProgressWrite();
  const before = structuredClone(f.rows);
  await expect(resolveCatalogConflict(f.args())).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  expect(f.rows).toEqual(before);
  const accepted = await resolveCatalogConflict(f.args());
  const rows = structuredClone(f.rows);
  expect(await resolveCatalogConflict(f.args())).toEqual(accepted);
  expect(f.rows).toEqual(rows);
  expect(fetch).not.toHaveBeenCalled();
});

it('publishes retained references and replays the compacted receipt after heads change', async () => {
  const f = await setup();
  const operation = await resolveCatalogConflict(f.args());
  if (operation.phase !== 'prepared') throw new Error('Expected prepared resolution');
  const manifests = new Map<string, Blob>();
  const read = vi.fn<SyncRemoteStore['read']>(async (key) => {
    const value = manifests.get(key);
    if (!value) throw new Error('An original body was requested');
    return value.stream();
  });
  const write = vi.fn<SyncRemoteStore['write']>(async (key, body) => {
    if (key.startsWith('Files/')) throw new Error('Resolution attempted to upload original bytes');
    manifests.set(key, body);
  });
  const remote: SyncRemoteStore = {
    list: vi.fn(async () => ({ objects: [], prefixes: [], nextCursor: null })),
    stat: vi.fn(async () => ({ size: binary.size })),
    read,
    write,
  };
  const published = await dispatchPreparedOutgoing(
    scope.spaceId,
    commandId,
    remote,
    new AbortController().signal
  );
  expect(published.objects).toEqual(f.left.objects);
  expect(write).toHaveBeenCalledOnce();
  expect(write.mock.calls[0]?.[0]).toBe(published.recordKey);
  expect(read.mock.calls.map(([key]) => key)).toEqual([published.recordKey]);
  expect(remote.stat).toHaveBeenCalledWith(f.left.objects[0]!.remoteKey, expect.any(AbortSignal));
  expect(io.readOriginal).not.toHaveBeenCalled();
  const compacted = parseSyncCaptureRecord(f.table('sync_capture').get(operation.key));
  expect(compacted).toMatchObject({ phase: 'published', objects: [] });
  expect(JSON.stringify(compacted)).not.toContain('recordText');
  expect(f.table('sync_capture').get(stateKey)).toEqual(f.state);
  const newHead = await attempt('new-head', 'edit', ['left']);
  const before = structuredClone(f.rows);
  expect(
    await resolveCatalogConflict({ ...f.args(), catalog: catalog([...f.records, newHead]) })
  ).toEqual(compacted);
  expect(f.rows).toEqual(before);
});

it('retains an uncommitted resolution after remote refusal and retries with the same logical bytes', async () => {
  const f = await setup();
  const operation = await resolveCatalogConflict(f.args());
  if (operation.phase !== 'prepared') throw new Error('Expected prepared resolution');
  const manifest = new Map<string, Blob>();
  const write = vi.fn<SyncRemoteStore['write']>(async (key, body) => {
    manifest.set(key, body);
  });
  const remote: SyncRemoteStore = {
    list: vi.fn(async () => ({ objects: [], prefixes: [], nextCursor: null })),
    stat: vi
      .fn<SyncRemoteStore['stat']>()
      .mockRejectedValueOnce(new SyncRemoteError('temporary'))
      .mockResolvedValue({ size: 3 }),
    read: vi.fn(async (key) => {
      const body = manifest.get(key);
      if (!body) throw new Error('Original body requested');
      return body.stream();
    }),
    write,
  };
  await expect(
    dispatchPreparedOutgoing(scope.spaceId, commandId, remote, new AbortController().signal)
  ).rejects.toMatchObject({ code: 'temporary' });
  expect(write).not.toHaveBeenCalled();
  expect(f.table('sync_capture').get(operation.key)).toEqual(operation);
  const attempt = await dispatchPreparedOutgoing(
    scope.spaceId,
    commandId,
    remote,
    new AbortController().signal
  );
  expect(write).toHaveBeenCalledOnce();
  expect(attempt.objects).toEqual(operation.prepared.retainedObjects);
  expect(io.readOriginal).not.toHaveBeenCalled();
});

it('refuses the final retained-manifest publication when a new native write wins during dispatch', async () => {
  const f = await setup();
  await resolveCatalogConflict(f.args());
  const prepared = await loadPreparedOutgoingOperation(scope.spaceId, commandId);
  if (!prepared) throw new Error('Missing prepared resolution');
  const reached = deferred();
  const release = deferred();
  const write = vi.fn<SyncRemoteStore['write']>();
  const remote: SyncRemoteStore = {
    list: vi.fn(async () => ({ objects: [], prefixes: [], nextCursor: null })),
    stat: vi.fn(async () => {
      reached.resolve();
      await release.promise;
      return { size: 3 };
    }),
    read: vi.fn(async () => {
      throw new Error('Original body requested');
    }),
    write,
  };
  const pending = dispatchPreparedOutgoing(
    scope.spaceId,
    commandId,
    remote,
    new AbortController().signal,
    {
      beforePublish: () => assertConflictResolutionCurrent(prepared),
    }
  );
  const refused = expect(pending).rejects.toMatchObject({ code: 'selection-changed' });
  await reached.promise;
  f.table('sync_capture').set(stateKey, { ...f.state, generation: 5, basis: ['new-local'] });
  release.resolve();
  await refused;
  expect(write).not.toHaveBeenCalled();
  expect(f.table('sync_capture').get(stateKey)).toMatchObject({
    generation: 5,
    basis: ['new-local'],
  });
  expect(io.readOriginal).not.toHaveBeenCalled();
});

it('retains competing decisions from the same heads as explicit competing causal operations', async () => {
  const f = await setup();
  const first = await resolveCatalogConflict(f.args(f.left));
  const second = await resolveCatalogConflict({
    ...f.args(f.right),
    operationId: '10000000-0000-4000-8000-000000000002',
  });
  if (first.phase !== 'prepared' || second.phase !== 'prepared')
    throw new Error('Expected prepared competing decisions');
  const decisions: CatalogAttempt[] = [];
  for (const value of [first, second])
    decisions.push({
      ...(await createSyncAttempt(
        value.prepared.recordText,
        crypto.randomUUID(),
        value.prepared.retainedObjects
      )),
      operationText: value.prepared.recordText,
      operation: await parseSyncOperationText(value.prepared.recordText),
    });
  const graph = catalog([...f.records, ...decisions]);
  expect(graph.roots.get(syncCatalogRootKey('media', rootId))).toMatchObject({
    heads: [first.operationId, second.operationId].sort(),
    conflict: true,
  });
  expect(f.table('sync_capture').get(first.key)).toEqual(first);
  expect(f.table('sync_capture').get(second.key)).toEqual(second);
  expect(f.table('sync_capture').get(stateKey)).toEqual(f.state);
});

it('replays the same decision when a new physical alternative sorts before its original source', async () => {
  const f = await setup();
  const accepted = await resolveCatalogConflict(f.args());
  const physical = await createSyncAttempt(
    f.left.operationText,
    '00000000-0000-4000-8000-000000000001'
  );
  const alternative = {
    ...physical,
    operationText: f.left.operationText,
    operation: f.left.operation,
  };
  const replayed = await resolveCatalogConflict({
    ...f.args(),
    catalog: catalog([...f.records, alternative]),
  });
  expect(replayed).toEqual(accepted);
  expect(replayed.phase === 'prepared' ? replayed.prepared.retainedObjects : []).toEqual(
    accepted.phase === 'prepared' ? accepted.prepared.retainedObjects : []
  );
});
