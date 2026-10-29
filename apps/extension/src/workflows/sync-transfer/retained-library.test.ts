import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { beforeEach, expect, it, vi } from 'vitest';
import { planRetainedLibrary, prepareRetainedLibrary } from './retained-library';
const io = vi.hoisted(() => ({
  connection: vi.fn(),
  catalog: vi.fn(),
  prepare: vi.fn(),
  wait: vi.fn(),
  cancel: vi.fn(),
  stores: new Map<string, Set<string>>(),
  captures: new Map<string, unknown>(),
}));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: io.connection,
}));
vi.mock('./catalog-view', () => ({ readCheckedPersistedSyncCatalog: io.catalog }));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => ({
    transaction: () => ({
      objectStore: (name: string) => ({
        get: async (key: string) => (name === 'sync_capture' ? io.captures.get(key) : undefined),
        getAllKeys: async () => [...(io.stores.get(name) ?? [])],
        getKey: async (key: string) => (io.stores.get(name)?.has(key) ? key : undefined),
      }),
      done: Promise.resolve(),
    }),
  }),
}));
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({
    prepareReplica: io.prepare,
    waitForOperation: io.wait,
    cancel: io.cancel,
  }),
}));
import {
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
const connection = {
  binding: {
    provider: 'webdav',
    rootUrl: 'https://dav.example/space/',
    accountId: 'user',
    spaceId: 'space',
    connectionGeneration: 1,
    profileCreatedAt: 1,
  },
  identity: { incarnation: '10000000-0000-4000-8000-000000000001', revision: 1 },
  phase: 'active',
};
function catalog() {
  return {
    invalid: [],
    invalidOperations: [],
    pending: [],
    quarantined: [],
    roots: new Map(
      ['local', 'remote'].map((rootId) => [
        rootId,
        {
          rootKind: 'video-project',
          rootId,
          heads: [rootId],
          deleted: false,
          conflict: false,
          blocked: false,
          unavailableDependencies: [],
        },
      ])
    ),
    operations: new Map(
      ['local', 'remote'].map((rootId) => [
        rootId,
        {
          operationText: JSON.stringify({ rootId }),
          operation: { operationId: rootId, envelope: { descriptor: { totalBytes: 1024 } } },
        },
      ])
    ),
  };
}
function acceptNative(rootId: string) {
  const rootKey = captureRootKey('space', 'video-project', rootId);
  const key = JSON.stringify(['root-state', rootKey]);
  io.captures.set(key, {
    version: 1,
    kind: 'root-state',
    key,
    rootKey,
    spaceId: 'space',
    rootKind: 'video-project',
    rootId,
    createdAt: 1,
    generation: 2,
    basis: [rootId],
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  io.stores.clear();
  io.captures.clear();
  io.captures.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    spaceId: 'space',
    createdAt: 1,
    connectionGeneration: 1,
  });
  acceptNative('local');
  io.stores.set(VIDEO_PROJECTS_STORE, new Set(['local']));
  io.connection.mockResolvedValue(structuredClone(connection));
  io.catalog.mockResolvedValue(catalog());
  io.prepare.mockResolvedValue({ kind: 'accepted', requestId: 'job' });
  io.cancel.mockResolvedValue({ kind: 'cancelled', outcome: 'refused' });
});
it('plans from native keys rather than a remote receipt and performs no file or runtime preparation', async () => {
  io.stores.set(VIDEO_WORKSPACE_DRAFTS_STORE, new Set(['draft-review']));
  const plan = await planRetainedLibrary();
  expect(plan?.nativeRootCount).toBe(2);
  expect(plan?.missing.map((root) => root.rootId)).toEqual(['remote']);
  expect(plan?.remoteBytesUpperBound).toBe(1024);
  expect(io.prepare).not.toHaveBeenCalled();
  expect(io.wait).not.toHaveBeenCalled();
});
it.each(['invalid', 'invalidOperations', 'pending', 'quarantined'] as const)(
  'refuses an incomplete %s catalog',
  async (field) => {
    io.catalog.mockResolvedValue({ ...catalog(), [field]: ['unknown'] });
    await expect(planRetainedLibrary()).rejects.toThrow('catalog-incomplete');
  }
);
it('refuses competing heads even for a native root instead of silently losing a remote version', async () => {
  const snapshot = catalog();
  snapshot.roots.get('local')!.conflict = true;
  io.catalog.mockResolvedValue(snapshot);
  await expect(planRetainedLibrary()).rejects.toThrow('conflict');
});
it('prepares a pinned missing root and skips the completed import on retry', async () => {
  const plan = (await planRetainedLibrary())!;
  io.wait.mockImplementation(async () => {
    io.stores.get(VIDEO_PROJECTS_STORE)!.add('remote');
    acceptNative('remote');
    return { job: { state: 'ready' }, completion: { kind: 'replica', selection: plan.missing[0] } };
  });
  await prepareRetainedLibrary(plan);
  await prepareRetainedLibrary(plan);
  expect(io.prepare).toHaveBeenCalledExactlyOnceWith(plan.missing[0], true);
});
it('preserves a local root created after planning without invoking incoming for that root', async () => {
  const plan = (await planRetainedLibrary())!;
  io.stores.get(VIDEO_PROJECTS_STORE)!.add('remote');
  await expect(prepareRetainedLibrary(plan)).rejects.toThrow('revision-changed');
  expect(io.prepare).not.toHaveBeenCalled();
});
it('refuses a replacement connection before issuing a job', async () => {
  const plan = (await planRetainedLibrary())!;
  io.connection.mockResolvedValue({
    ...connection,
    identity: { ...connection.identity, revision: 2 },
  });
  await expect(prepareRetainedLibrary(plan)).rejects.toThrow('connection changed');
  expect(io.prepare).not.toHaveBeenCalled();
});
it('refuses a changed connection after executor settlement and keeps the completed import', async () => {
  const plan = (await planRetainedLibrary())!;
  io.wait.mockImplementation(async () => {
    io.stores.get(VIDEO_PROJECTS_STORE)!.add('remote');
    io.connection.mockResolvedValue({
      ...connection,
      binding: { ...connection.binding, rootUrl: 'https://other.example/' },
    });
    return { job: { state: 'ready' }, completion: { kind: 'replica', selection: plan.missing[0] } };
  });
  await expect(prepareRetainedLibrary(plan)).rejects.toThrow('connection changed');
  expect(io.stores.get(VIDEO_PROJECTS_STORE)!.has('remote')).toBe(true);
});
it.each(['lost-job', 'wrong-selection', 'missing-native', 'failed'])(
  'does not report a complete library after %s',
  async (failure) => {
    const plan = (await planRetainedLibrary())!;
    io.wait.mockResolvedValue({
      job: failure === 'lost-job' ? null : { state: failure === 'failed' ? 'failed' : 'ready' },
      completion: {
        kind: 'replica',
        selection: {
          ...plan.missing[0],
          rootId: failure === 'wrong-selection' ? 'foreign' : 'remote',
        },
      },
    });
    await expect(prepareRetainedLibrary(plan)).rejects.toThrow(
      'Library backup preparation is incomplete.'
    );
  }
);
it('cancels and drains the active executor before returning; completed data remains for retry', async () => {
  const plan = (await planRetainedLibrary())!;
  let finish!: (result: unknown) => void;
  io.wait.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const abort = new AbortController();
  let settled = false;
  const operation = prepareRetainedLibrary(plan, abort.signal).finally(() => {
    settled = true;
  });
  const observed = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(io.wait).toHaveBeenCalledOnce());
  abort.abort();
  expect(io.cancel).toHaveBeenCalledWith('job');
  expect(settled).toBe(false);
  io.stores.get(VIDEO_PROJECTS_STORE)!.add('remote');
  finish({ job: { state: 'ready' }, completion: { kind: 'replica', selection: plan.missing[0] } });
  await observed;
  expect(io.stores.get(VIDEO_PROJECTS_STORE)!.has('remote')).toBe(true);
});
it('keeps disconnected native backup independent of sync', async () => {
  io.connection.mockResolvedValue(null);
  expect(await planRetainedLibrary()).toBeNull();
  expect(io.catalog).not.toHaveBeenCalled();
});

it('does not claim a full retained set while a native root has an unreceived server revision', async () => {
  const snapshot = catalog();
  snapshot.roots.get('local')!.heads = ['newer'];
  snapshot.operations.set('newer', {
    operationText: 'newer',
    operation: { operationId: 'newer', envelope: { descriptor: { totalBytes: 1024 } } },
  });
  io.catalog.mockResolvedValue(snapshot);
  await expect(planRetainedLibrary()).rejects.toThrow();
  expect(io.prepare).not.toHaveBeenCalled();
});
