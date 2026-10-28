import { createGuideProject } from '../../features/scenario/project/factories';
import { createScenarioProjectEntry } from '../../composition/persistence/scenario/projects/entry';
import { parseRootEnvelope } from '../media-hub-backup/v6/codec';
import { beforeEach, expect, it, vi } from 'vitest';
import { receiveSelectedCatalogRoot, type SelectedCatalogRoot } from './incoming-selected';
import { syncCatalogRootKey, type CatalogOperation } from './catalog-graph';
import type { scanSyncCatalog } from './catalog';
import type { SyncRemoteStore } from './remote-store';
import { hashSyncText } from './wire-record';

const io = vi.hoisted(() => ({
  admit: vi.fn(),
  receipt: vi.fn(),
  prepare: vi.fn(),
  publish: vi.fn(),
  cancel: vi.fn(),
  events: [] as string[],
}));
vi.mock('../../composition/persistence/sync-capture/catalog-admission', () => ({
  loadCatalogReplicaAdmission: io.admit,
  hasCatalogReplicaReceipt: io.receipt,
}));
vi.mock('./incoming', () => ({ prepareCatalogReplica: io.prepare }));
vi.mock('../../composition/persistence/sync-capture/replica-publication', () => ({
  publishPreparedReplicaJournal: io.publish,
}));
vi.mock('../../composition/persistence/infrastructure/mutation-barrier', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/mutation-barrier')
  >()),
  runWithDurableAssetLifecycleLock: async (work: () => Promise<unknown>) => work(),
}));
vi.mock('../../composition/persistence/assets/publication', async (original) => {
  const actual =
    await original<typeof import('../../composition/persistence/assets/publication')>();
  return {
    ...actual,
    cancelAssetPublication: io.cancel,
    publishReadyJournalWithRetry: async (
      journal: unknown,
      publish: (ready: unknown) => Promise<void>
    ) => {
      try {
        await publish(journal);
      } catch (error) {
        if (error instanceof actual.SupersededAssetPublicationError) await io.cancel(journal);
        throw error;
      }
    },
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function operation(
  rootKind: SelectedCatalogRoot['rootKind'],
  rootId: string,
  dependencies: { mediaId: string; basis: string[] }[] = []
): CatalogOperation {
  const value: CatalogOperation['operation'] = {
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: 'space',
    operationId: `${rootId}-op`,
    rootKind,
    rootId,
    kind: 'edit',
    parents: [],
    dependencies,
    envelope: null,
    objects: [],
  };
  return { operation: value, operationText: JSON.stringify(value), attempts: [] };
}
function fixture(project = true) {
  const media = operation('media', 'source');
  const parent = operation('video-project', 'parent', [
    { mediaId: 'source', basis: ['source-op'] },
  ]);
  const selected = project ? parent : media;
  const catalog: Awaited<ReturnType<typeof scanSyncCatalog>> = {
    operations: new Map(
      [media, ...(project ? [parent] : [])].map((source) => [source.operation.operationId, source])
    ),
    roots: new Map(
      [media, ...(project ? [parent] : [])].map((source) => [
        syncCatalogRootKey(source.operation.rootKind, source.operation.rootId),
        {
          rootKind: source.operation.rootKind,
          rootId: source.operation.rootId,
          heads: [source.operation.operationId],
          deleted: false,
          conflict: false,
          blocked: false,
          unavailableDependencies: [],
        },
      ])
    ),
    quarantined: [],
    pending: [],
    invalidOperations: [],
    invalid: [],
    metadataBytes: 0,
    pages: 1,
  };
  const remote: SyncRemoteStore = {
    stat: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
  };
  const controller = new AbortController();
  return {
    remote,
    catalog,
    scope: { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 },
    authorization: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
    selection: {
      rootKind: selected.operation.rootKind,
      rootId: selected.operation.rootId,
      operationId: selected.operation.operationId,
      sourceDigest: hashSyncText(selected.operationText),
    },
    signal: controller.signal,
    controller,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.events = [];
  io.receipt.mockResolvedValue(false);
  io.admit.mockImplementation(async ({ rootId }) => {
    io.events.push(`admit:${rootId}`);
    return {
      expectedLocalGeneration: 0,
      expectedBasis: [],
      expectedWorkspaceRevision: null,
      dependencies: [],
    };
  });
  io.prepare.mockImplementation(async ({ rootId }) => {
    io.events.push(`prepare:${rootId}`);
    return {
      journalId: rootId,
      assetRefs: [],
      createdAt: 1,
      domain: 'sync-replica',
      payload: null,
    };
  });
  io.publish.mockImplementation(async (journal) => {
    io.events.push(`commit:${journal.journalId}`);
  });
  io.cancel.mockResolvedValue(undefined);
});

it('commits dependencies before reading parent native admission and returns the pinned native root', async () => {
  const f = fixture();
  await expect(receiveSelectedCatalogRoot(f)).resolves.toEqual({
    rootKind: 'video-project',
    rootId: 'parent',
    operationId: 'parent-op',
  });
  expect(io.events).toEqual([
    'admit:source',
    'prepare:source',
    'commit:source',
    'admit:parent',
    'prepare:parent',
    'commit:parent',
  ]);
  expect(io.admit.mock.calls[1]![0]).toMatchObject({
    scope: f.scope,
    authorization: f.authorization,
    rootId: 'parent',
    dependencyMediaIds: ['source'],
  });
});

it('refuses changed operation or digest and unavailable roots before native preparation', async () => {
  for (const field of ['operationId', 'sourceDigest'] as const) {
    const f = fixture();
    f.selection[field] = 'changed';
    await expect(receiveSelectedCatalogRoot(f)).rejects.toThrow('changed or is unavailable');
  }
  for (const field of ['deleted', 'conflict', 'blocked'] as const) {
    const f = fixture();
    f.catalog.roots.get(syncCatalogRootKey('video-project', 'parent'))![field] = true;
    await expect(receiveSelectedCatalogRoot(f)).rejects.toThrow('changed or is unavailable');
  }
  expect(io.admit).not.toHaveBeenCalled();
  expect(io.prepare).not.toHaveBeenCalled();
});

it('preserves a completed dependency when parent preparation fails', async () => {
  const f = fixture();
  io.prepare.mockImplementation(async ({ rootId }) => {
    if (rootId === 'parent') throw new Error('Parent source unavailable');
    return { journalId: rootId, assetRefs: [], payload: null };
  });
  await expect(receiveSelectedCatalogRoot(f)).rejects.toThrow('Parent source unavailable');
  expect(io.publish).toHaveBeenCalledTimes(1);
  expect(io.events).toContain('commit:source');
  expect(io.cancel).not.toHaveBeenCalled();
});

it('stops the parent after cancellation during an admitted dependency publication', async () => {
  const f = fixture();
  const admitted = deferred();
  const committed = deferred();
  io.publish.mockImplementation(async () => {
    admitted.resolve();
    await committed.promise;
  });
  const running = receiveSelectedCatalogRoot(f);
  await admitted.promise;
  f.controller.abort();
  committed.resolve();
  await expect(running).rejects.toThrow();
  expect(io.publish).toHaveBeenCalledTimes(1);
  expect(io.admit).toHaveBeenCalledTimes(1);
  expect(io.cancel).not.toHaveBeenCalled();
});

it('durably cancels a prepared uncommitted journal before acknowledging cancellation', async () => {
  const f = fixture(false);
  const cancellation = deferred();
  const cancelling = deferred();
  io.prepare.mockImplementation(async () => {
    f.controller.abort();
    return { journalId: 'source', assetRefs: [], payload: null };
  });
  io.cancel.mockImplementation(async () => {
    cancelling.resolve();
    await cancellation.promise;
  });
  const running = receiveSelectedCatalogRoot(f);
  let settled = false;
  void running.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await cancelling.promise;
  expect(settled).toBe(false);
  expect(io.publish).not.toHaveBeenCalled();
  cancellation.resolve();
  await expect(running).rejects.toThrow();
  expect(io.cancel).toHaveBeenCalledTimes(1);
});

it('reports completed when cancellation races with an admitted selected-root commit', async () => {
  const f = fixture(false);
  const admitted = deferred();
  const commit = deferred();
  io.publish.mockImplementation(async () => {
    admitted.resolve();
    await commit.promise;
  });
  const running = receiveSelectedCatalogRoot(f);
  await admitted.promise;
  f.controller.abort();
  commit.resolve();
  await expect(running).resolves.toEqual({
    rootKind: 'media',
    rootId: 'source',
    operationId: 'source-op',
  });
  expect(io.cancel).not.toHaveBeenCalled();
});

it('preserves a committed selected root when cleanup fails after cancellation', async () => {
  const f = fixture(false);
  io.publish.mockImplementation(async () => {
    f.controller.abort();
    throw new Error('Cleanup failed');
  });
  io.receipt.mockResolvedValue(true);
  await expect(receiveSelectedCatalogRoot(f)).resolves.toEqual({
    rootKind: 'media',
    rootId: 'source',
    operationId: 'source-op',
  });
  expect(io.cancel).not.toHaveBeenCalled();
});

it('commits a compatible Scenario prerequisite before Montage admission using its current causal basis', async () => {
  const f = fixture();
  const before = operation('scenario-project', 'scenario');
  const project = createGuideProject('Prerequisite', 'scenario', 1);
  before.operation.envelope = parseRootEnvelope({
    descriptor: {
      rootKind: 'scenario-project',
      rootId: 'scenario',
      metadataPath: 'Metadata/sync-root.json',
      objectCount: 0,
      totalBytes: 0,
    },
    metadata: {
      entry: createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 }),
      assets: [],
      stepDocuments: [],
      exports: [],
      exportThumbnails: [],
    },
    objects: [],
  });
  before.operationText = JSON.stringify(before.operation);
  const renamed = structuredClone(before);
  renamed.operation.operationId = 'scenario-renamed';
  renamed.operation.parents = [before.operation.operationId];
  renamed.operationText = JSON.stringify(renamed.operation);
  for (const source of [before, renamed])
    f.catalog.operations.set(source.operation.operationId, source);
  f.catalog.roots.set(syncCatalogRootKey('scenario-project', 'scenario'), {
    rootKind: 'scenario-project',
    rootId: 'scenario',
    heads: ['scenario-renamed'],
    deleted: false,
    blocked: false,
    conflict: false,
    unavailableDependencies: [],
  });
  const parent = f.catalog.operations.get('parent-op')!;
  parent.operation.dependencies = [];
  parent.operation.rootDependencies = [
    { rootKind: 'scenario-project', rootId: 'scenario', basis: ['scenario-op'], childIds: [] },
  ];
  parent.operationText = JSON.stringify(parent.operation);
  f.selection.sourceDigest = hashSyncText(parent.operationText);
  await receiveSelectedCatalogRoot(f);
  expect(io.events).toEqual([
    'admit:scenario',
    'prepare:scenario',
    'commit:scenario',
    'admit:parent',
    'prepare:parent',
    'commit:parent',
  ]);
  expect(io.admit.mock.calls[1]![0]).toMatchObject({
    rootId: 'parent',
    dependencyRoots: [
      {
        rootKind: 'scenario-project',
        rootId: 'scenario',
        basis: ['scenario-renamed'],
        childIds: [],
      },
    ],
  });
  io.admit.mockClear();
  f.catalog.roots.get(syncCatalogRootKey('scenario-project', 'scenario'))!.heads.push('missing');
  await expect(receiveSelectedCatalogRoot(f)).rejects.toThrow('dependency is unavailable');
  expect(io.admit).not.toHaveBeenCalled();
});
