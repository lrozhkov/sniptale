import { captureRootKey } from '../../composition/persistence/sync-capture/contracts';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  prepareLibraryBackup,
  prepareLibraryBackupInRuntime,
  planRetainedLibrary,
  prepareRetainedLibrary,
  readRetainedNativePresence,
} from './retained-library';
const io = vi.hoisted(() => ({
  connection: vi.fn(),
  library: vi.fn(),
  receive: vi.fn(),
  native: vi.fn(),
  inventory: vi.fn(),
  parse: vi.fn(),
  reading: false,
  parsed: new Map<string, unknown>(),
  catalog: vi.fn(),
  prepare: vi.fn(),
  wait: vi.fn(),
  cancel: vi.fn(),
  count: vi.fn(),
  get: vi.fn(),
  keys: vi.fn(),
  transaction: vi.fn(),
  done: vi.fn(),
  stores: new Map<string, Set<string>>(),
  captures: new Map<string, unknown>(),
}));
vi.mock('../../composition/persistence/remote-connection/store', () => ({
  loadSyncConnection: io.connection,
}));
vi.mock('../../composition/persistence/assets/resource-sessions', () => ({
  runWithAssetResourceRead: async (operation: () => Promise<unknown>) => {
    io.reading = true;
    try {
      return await operation();
    } finally {
      io.reading = false;
    }
  },
}));
vi.mock('./incoming-selected', () => ({ receiveSelectedCatalogRoot: io.receive }));
vi.mock('./native-residency', async (original) => ({
  ...(await original<typeof import('./native-residency')>()),
  prepareNativeEditingRoot: io.native,
}));
vi.mock('../media-hub-backup/v6/inventory', () => ({
  prepareMediaHubBackupRootsFromLibraryV6: io.inventory,
}));
vi.mock('./prepared-root', () => ({ parsePortableSyncRoot: io.parse }));
vi.mock('./catalog-view', () => ({ readCheckedPersistedSyncCatalog: io.catalog }));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => ({
    transaction: (names: string[], mode: string) => {
      io.transaction(names, mode);
      return {
        objectStore: (name: string) => ({
          count: () => io.count(name),
          get: async (key: string) => {
            io.get(name, key);
            return name === 'sync_capture' ? io.captures.get(key) : undefined;
          },
          getAllKeys: async () => {
            io.keys(name);
            return [...(io.stores.get(name) ?? [])];
          },
          getKey: async (key: string) => {
            io.keys(name, key);
            return io.stores.get(name)?.has(key) ? key : undefined;
          },
        }),
        get done() {
          return io.done();
        },
      };
    },
  }),
}));
vi.mock('../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({
    prepareReplica: io.prepare,
    prepareLibraryBackup: io.library,
    waitForOperation: io.wait,
    cancel: io.cancel,
  }),
}));
import { createMediaHubBackupExportOptions } from '../media-hub-backup/v6/options';
import type { MediaHubBackupExportOptions } from '../media-hub-backup/v6/contracts';
import type { scanSyncCatalog } from './catalog';
import type { SyncNativeEditingRoot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createSyncDownloadAllowance } from './native-residency';
import { syncCatalogRootKey } from './catalog-graph';
import {
  MEDIA_LIBRARY_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
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
  io.parsed.clear();
  io.reading = false;
  io.library.mockResolvedValue({ kind: 'accepted', requestId: 'library-job' });
  io.inventory.mockResolvedValue({});
  io.native.mockResolvedValue({ downloaded: 0 });
  io.parse.mockImplementation(async (envelope: { metadata: { marker: string } }) =>
    io.parsed.get(envelope.metadata.marker)
  );
  io.count.mockImplementation(async (name: string) => io.stores.get(name)?.size ?? 0);
  io.done.mockResolvedValue(undefined);
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

it.each([
  [MEDIA_LIBRARY_STORE, 'trash-or-saved-media'],
  [VIDEO_PROJECTS_STORE, 'saved-project'],
  [VIDEO_WORKSPACES_STORE, 'archived-review'],
  [VIDEO_WORKSPACE_DRAFTS_STORE, 'draft-review'],
  [SCENARIO_PROJECTS_STORE, 'scenario'],
])(
  'detects retained native presence from counts in %s without enumerating keys or values',
  async (store, id) => {
    io.stores.clear();
    io.stores.set(store, new Set([id]));
    expect(await readRetainedNativePresence()).toBe(true);
    expect(io.count).toHaveBeenCalledTimes(5);
    expect(io.transaction).toHaveBeenCalledExactlyOnceWith(
      [
        MEDIA_LIBRARY_STORE,
        VIDEO_PROJECTS_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        SCENARIO_PROJECTS_STORE,
      ],
      'readonly'
    );
    expect(io.get).not.toHaveBeenCalled();
    expect(io.keys).not.toHaveBeenCalled();
    expect(io.catalog).not.toHaveBeenCalled();
    expect(io.prepare).not.toHaveBeenCalled();
  }
);
it('reports empty only when every retained root store count is valid and zero', async () => {
  io.stores.clear();
  expect(await readRetainedNativePresence()).toBe(false);
  expect(io.count).toHaveBeenCalledTimes(5);
  expect(io.get).not.toHaveBeenCalled();
  expect(io.keys).not.toHaveBeenCalled();
});
it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '0'])(
  'rejects malformed presence count %j instead of reporting an empty library',
  async (count) => {
    io.stores.clear();
    io.count.mockResolvedValueOnce(count);
    await expect(readRetainedNativePresence()).rejects.toThrow('count is invalid');
    expect(io.get).not.toHaveBeenCalled();
    expect(io.keys).not.toHaveBeenCalled();
  }
);
it('rejects count and readonly transaction failures instead of reporting an empty library', async () => {
  io.count.mockRejectedValueOnce(new Error('Count unavailable'));
  await expect(readRetainedNativePresence()).rejects.toThrow('Count unavailable');
  io.done.mockRejectedValueOnce(new Error('Read transaction aborted'));
  await expect(readRetainedNativePresence()).rejects.toThrow('Read transaction aborted');
});

const selectedOptions = createMediaHubBackupExportOptions({
  scope: 'selected',
  selected: { mediaAssetIds: [], scenarioProjectIds: [], videoProjectIds: ['remote', 'remote'] },
});
function libraryReady(options: MediaHubBackupExportOptions) {
  return {
    kind: 'operation',
    job: { requestId: 'library-job', kind: 'library-backup-prepare', state: 'ready' },
    completion: { kind: 'library-backup', expected: connection.identity, options },
  };
}

it(
  'starts one options-aware backup action with deduplicated selection and verifies ' +
    'its own exact ready completion',
  async () => {
    const normalized = createMediaHubBackupExportOptions(selectedOptions);
    io.wait.mockResolvedValue(libraryReady(normalized));
    await expect(prepareLibraryBackup(selectedOptions)).resolves.toBe(true);
    expect(io.library).toHaveBeenCalledExactlyOnceWith({
      expected: connection.identity,
      options: normalized,
    });
    expect(io.wait).toHaveBeenCalledExactlyOnceWith('library-job');
    expect(io.prepare).not.toHaveBeenCalled();
    expect(io.catalog).not.toHaveBeenCalled();
  }
);

it('omits stale selected fields for an all-Library action instead of changing its scope', async () => {
  const options = createMediaHubBackupExportOptions({ ...selectedOptions, scope: 'all' });
  const { selected: _selected, ...normalized } = options;
  io.wait.mockResolvedValue(libraryReady(normalized));
  await expect(prepareLibraryBackup(options)).resolves.toBe(true);
  expect(io.library).toHaveBeenCalledExactlyOnceWith({
    expected: connection.identity,
    options: normalized,
  });
});

it('returns false only for genuinely disconnected callers without an expected connection', async () => {
  io.connection.mockResolvedValue(null);
  await expect(prepareLibraryBackup(selectedOptions)).resolves.toBe(false);
  await expect(
    prepareLibraryBackup(selectedOptions, undefined, connection.identity)
  ).rejects.toThrow('connection changed');
  expect(io.library).not.toHaveBeenCalled();
});

it.each(['paused', 'checking', 'retiring', 'updating-auth', 'error'])(
  'refuses connected phase %s rather than exporting only a partial local Library',
  async (phase) => {
    io.connection.mockResolvedValue({ ...connection, phase });
    await expect(prepareLibraryBackup(selectedOptions)).rejects.toThrow('connection');
    expect(io.library).not.toHaveBeenCalled();
  }
);

it.each(['request', 'job-kind', 'state', 'expected', 'options'])(
  'rejects mismatched Library completion %s',
  async (field) => {
    const normalized = createMediaHubBackupExportOptions(selectedOptions);
    const result = libraryReady(normalized);
    if (field === 'request') result.job.requestId = 'other';
    if (field === 'job-kind') result.job.kind = 'backup-prepare';
    if (field === 'state') result.job.state = 'failed';
    if (field === 'expected') result.completion.expected = { ...connection.identity, revision: 2 };
    if (field === 'options') result.completion.options = { ...normalized, includeDrafts: true };
    io.wait.mockResolvedValue(result);
    await expect(prepareLibraryBackup(selectedOptions)).rejects.toThrow('incomplete');
  }
);

it('refuses stale expected identities before dispatch and a replacement connection after completion', async () => {
  await expect(
    prepareLibraryBackup(selectedOptions, undefined, { ...connection.identity, revision: 2 })
  ).rejects.toThrow('connection changed');
  expect(io.library).not.toHaveBeenCalled();
  io.wait.mockImplementationOnce(async () => {
    io.connection.mockResolvedValue({
      ...connection,
      identity: { ...connection.identity, revision: 2 },
    });
    return libraryReady(createMediaHubBackupExportOptions(selectedOptions));
  });
  await expect(prepareLibraryBackup(selectedOptions)).rejects.toThrow('connection changed');
});

it('cancels only its own Library job and drains executor settlement before rejecting', async () => {
  let finish!: (value: unknown) => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  io.wait.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const controller = new AbortController();
  let settled = false;
  const operation = prepareLibraryBackup(selectedOptions, controller.signal).finally(() => {
    settled = true;
  });
  const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  await waiting;
  controller.abort();
  expect(io.cancel).toHaveBeenCalledExactlyOnceWith('library-job');
  expect(settled).toBe(false);
  finish(libraryReady(createMediaHubBackupExportOptions(selectedOptions)));
  await rejected;
});

function runtimeCatalog(
  entries: {
    id: string;
    kind?: SyncNativeEditingRoot['rootKind'];
    draft?: boolean;
    web?: boolean;
    trash?: boolean;
  }[]
): Awaited<ReturnType<typeof scanSyncCatalog>> {
  const value: Awaited<ReturnType<typeof scanSyncCatalog>> = {
    operations: new Map(),
    roots: new Map(),
    invalid: [],
    invalidOperations: [],
    pending: [],
    quarantined: [],
    metadataBytes: 0,
    pages: 1,
  };
  for (const entry of entries) {
    const kind = entry.kind ?? 'video-project';
    const lifecycle = {
      storageClass: entry.draft ? 'temporary' : 'library',
      savedAt: 1,
      updatedAt: 1,
      ...(entry.trash ? { trashedAt: 2 } : {}),
    };
    const descriptor = {
      rootId: entry.id,
      metadataPath: 'Metadata/sync-root.json',
      objectCount: 0,
      totalBytes: 0,
      ...(kind === 'media' || kind === 'video-review'
        ? { rootKind: 'media' as const, mediaSubtype: 'library-item' as const }
        : { rootKind: kind }),
    };
    const envelope = { descriptor, metadata: { marker: entry.id }, objects: [] };
    const metadata = {
      entry: {
        id: entry.id,
        lifecycle,
        source: { kind: entry.web ? 'web-snapshot' : 'stored-asset' },
      },
      ...(kind === 'video-review'
        ? { videoReview: { workspace: { project: { lifecycle } } } }
        : {}),
    };
    io.parsed.set(entry.id, { kind, envelope, metadata });
    value.roots.set(syncCatalogRootKey(kind, entry.id), {
      rootKind: kind,
      rootId: entry.id,
      heads: [entry.id],
      deleted: false,
      conflict: false,
      blocked: false,
      unavailableDependencies: [],
    });
    value.operations.set(entry.id, {
      operation: {
        format: 'sniptale-sync-operation',
        version: 1,
        spaceId: 'space',
        operationId: entry.id,
        rootKind: kind,
        rootId: entry.id,
        kind: 'edit',
        parents: [],
        dependencies: [],
        envelope,
        objects: [],
      },
      operationText: JSON.stringify({ id: entry.id }),
      attempts: [],
    });
  }
  return value;
}
function runtimeArgs(snapshot = runtimeCatalog([{ id: 'remote' }])) {
  return {
    catalog: snapshot,
    binding: { ...connection.binding, provider: 'webdav' as const },
    authorization: connection.identity,
    expected: connection.identity,
    options: createMediaHubBackupExportOptions(),
    signal: new AbortController().signal,
    downloadAllowance: createSyncDownloadAllowance({ maxBytes: 10, maxObjects: 10 }),
    remote: { read: vi.fn(), write: vi.fn(), list: vi.fn(), stat: vi.fn() },
  };
}
function installReceived(root: SyncNativeEditingRoot, operationId = root.rootId) {
  const store =
    root.rootKind === 'video-project'
      ? VIDEO_PROJECTS_STORE
      : root.rootKind === 'scenario-project'
        ? SCENARIO_PROJECTS_STORE
        : root.rootKind === 'video-review'
          ? VIDEO_WORKSPACES_STORE
          : MEDIA_LIBRARY_STORE;
  const keys = io.stores.get(store) ?? new Set<string>();
  keys.add(root.rootId);
  io.stores.set(store, keys);
  const rootKey = captureRootKey('space', root.rootKind, root.rootId);
  const key = JSON.stringify(['root-state', rootKey]);
  io.captures.set(key, {
    version: 1,
    kind: 'root-state',
    key,
    rootKey,
    spaceId: 'space',
    rootKind: root.rootKind,
    rootId: root.rootId,
    createdAt: 1,
    generation: 1,
    basis: [operationId],
  });
}

it(
  'prepares only eligible checked heads and passes one allowance into receive plus ' +
    'canonical native inventory callbacks',
  async () => {
    const snapshot = runtimeCatalog([
      { id: 'remote' },
      { id: 'draft', draft: true },
      { id: 'web', kind: 'media', web: true },
      { id: 'trashed-review', kind: 'video-review', trash: true },
      { id: 'other' },
    ]);
    const args = {
      ...runtimeArgs(snapshot),
      options: createMediaHubBackupExportOptions({
        scope: 'selected',
        includeWebSnapshots: false,
        selected: {
          mediaAssetIds: ['web', 'trashed-review'],
          videoProjectIds: ['remote', 'draft'],
          scenarioProjectIds: [],
        },
      }),
    };
    io.receive.mockImplementation(async (request) => {
      expect(io.reading).toBe(true);
      installReceived(request.selection);
      return request.selection;
    });
    io.inventory.mockImplementation(async (_options, admission) => {
      expect(io.reading).toBe(true);
      await admission.prepareRoot({ rootKind: 'video-project', rootId: 'remote' });
    });
    await prepareLibraryBackupInRuntime(args);
    expect(io.receive).toHaveBeenCalledTimes(1);
    expect(io.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({ rootId: 'remote' }),
        preserveNative: true,
        downloadAllowance: args.downloadAllowance,
        scope: args.binding,
        authorization: args.authorization,
      })
    );
    expect(io.inventory).toHaveBeenCalledWith(
      args.options,
      expect.objectContaining({ requireSelected: true })
    );
    expect(io.native).toHaveBeenCalledExactlyOnceWith({
      root: { rootKind: 'video-project', rootId: 'remote' },
      purpose: 'backup',
      binding: args.binding,
      authorization: args.authorization,
      remote: args.remote,
      signal: args.signal,
      downloadAllowance: args.downloadAllowance,
    });
    expect(io.reading).toBe(false);
  }
);

it('preserves native revisions and refuses an unreceived remote head instead of overwriting local data', async () => {
  const args = runtimeArgs(runtimeCatalog([{ id: 'local' }]));
  const pendingKey = JSON.stringify([
    'pending-checkpoint',
    captureRootKey('space', 'video-project', 'local'),
  ]);
  const pending = {
    version: 1,
    kind: 'pending-checkpoint',
    key: pendingKey,
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 1,
    profileCreatedAt: 1,
    rootKind: 'video-project',
    rootId: 'local',
    rootKey: captureRootKey('space', 'video-project', 'local'),
    revision: '11111111-1111-4111-8111-111111111111',
    dueAt: 100,
    flushRequested: false,
  };
  io.captures.set(pendingKey, pending);
  const before = structuredClone([...io.captures]);
  await prepareLibraryBackupInRuntime(args);
  expect([...io.captures]).toEqual(before);
  expect(io.captures.get(pendingKey)).toBe(pending);
  expect(io.receive).not.toHaveBeenCalled();
  const state = [...io.captures.entries()].find(([key]) => key.includes('root-state'))!;
  if (typeof state[1] !== 'object' || state[1] === null)
    throw new Error('Missing native state fixture.');
  io.captures.set(state[0], { ...state[1], basis: ['older'] });
  await expect(prepareLibraryBackupInRuntime(args)).rejects.toThrow('revision-changed');
  expect(io.receive).not.toHaveBeenCalled();
});

it('charges remote dependencies and final native hydration to the same cumulative physical allowance', async () => {
  const args = runtimeArgs(runtimeCatalog([{ id: 'remote' }, { id: 'second' }]));
  const reads: string[] = [];
  io.receive.mockImplementation(async (request) => {
    request.downloadAllowance.reserveObject(4);
    reads.push(request.selection.rootId);
    installReceived(request.selection);
  });
  io.inventory.mockImplementation(async (_options, admission) => {
    await admission.prepareRoot({ rootKind: 'video-project', rootId: 'remote' });
  });
  io.native.mockImplementation(async (request) => {
    request.downloadAllowance.reserveObject(4);
    reads.push('native');
  });
  await expect(prepareLibraryBackupInRuntime(args)).rejects.toThrow('allowance exceeded');
  expect(reads).toEqual(['remote', 'second']);
  expect(io.stores.get(VIDEO_PROJECTS_STORE)?.has('remote')).toBe(true);
  expect(io.stores.get(VIDEO_PROJECTS_STORE)?.has('second')).toBe(true);
  expect(io.reading).toBe(false);
});

it(
  'keeps first committed roots when the aggregate budget refuses a later GET and ' +
    'retry uses fresh allowance',
  async () => {
    const args = runtimeArgs(runtimeCatalog([{ id: 'remote' }, { id: 'second' }]));
    const reads: string[] = [];
    io.receive.mockImplementation(async (request) => {
      request.downloadAllowance.reserveObject(6);
      reads.push(request.selection.rootId);
      installReceived(request.selection);
    });
    await expect(prepareLibraryBackupInRuntime(args)).rejects.toThrow('allowance exceeded');
    expect(reads).toEqual(['remote']);
    expect(io.stores.get(VIDEO_PROJECTS_STORE)?.has('remote')).toBe(true);
    await prepareLibraryBackupInRuntime({
      ...args,
      downloadAllowance: createSyncDownloadAllowance({ maxBytes: 10, maxObjects: 10 }),
    });
    expect(reads).toEqual(['remote', 'second']);
  }
);

it('fails closed on unknown catalog evidence but ignores a proven unselected conflict', async () => {
  const snapshot = runtimeCatalog([{ id: 'remote' }, { id: 'other' }]);
  snapshot.roots.get(syncCatalogRootKey('video-project', 'other'))!.conflict = true;
  const args = {
    ...runtimeArgs(snapshot),
    options: createMediaHubBackupExportOptions(selectedOptions),
  };
  io.receive.mockImplementation(async (request) => {
    installReceived(request.selection);
  });
  await prepareLibraryBackupInRuntime(args);
  expect(io.receive).toHaveBeenCalledTimes(1);
  await expect(
    prepareLibraryBackupInRuntime({ ...args, catalog: { ...snapshot, pending: ['unknown'] } })
  ).rejects.toThrow('catalog-incomplete');
});

it(
  'rechecks the exact native root after concurrent receive and refuses connection ' +
    'replacement before native hydration',
  async () => {
    const args = runtimeArgs();
    io.receive.mockImplementationOnce(async (request) => {
      installReceived(request.selection, 'replacement');
    });
    await expect(prepareLibraryBackupInRuntime(args)).rejects.toThrow('revision-changed');
    expect(io.inventory).not.toHaveBeenCalled();
    io.stores.clear();
    io.receive.mockImplementationOnce(async (request) => {
      installReceived(request.selection);
      io.connection.mockResolvedValue({
        ...connection,
        identity: { ...connection.identity, revision: 2 },
      });
    });
    await expect(prepareLibraryBackupInRuntime(args)).rejects.toThrow('connection changed');
    expect(io.native).not.toHaveBeenCalled();
  }
);

it(
  'holds the one Library resource reader until cancelled receive settles and ' +
    'preserves the committed root',
  async () => {
    const args = runtimeArgs();
    const abort = new AbortController();
    args.signal = abort.signal;
    let finish!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    io.receive.mockImplementationOnce(async (request) => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      installReceived(request.selection);
    });
    const operation = prepareLibraryBackupInRuntime(args);
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await waiting;
    abort.abort();
    expect(io.reading).toBe(true);
    expect(io.inventory).not.toHaveBeenCalled();
    finish();
    await rejected;
    expect(io.stores.get(VIDEO_PROJECTS_STORE)?.has('remote')).toBe(true);
    expect(io.reading).toBe(false);
  }
);

it('canonicalizes reversed nested completion keys without accepting a different Library selection', async () => {
  const normalized = createMediaHubBackupExportOptions(selectedOptions);
  io.wait.mockResolvedValue({
    kind: 'operation',
    job: { requestId: 'library-job', kind: 'library-backup-prepare', state: 'ready' },
    completion: {
      kind: 'library-backup',
      expected: {
        revision: connection.identity.revision,
        incarnation: connection.identity.incarnation,
      },
      options: {
        selected: { videoProjectIds: ['remote'], scenarioProjectIds: [], mediaAssetIds: [] },
        scope: 'selected',
        includeWebSnapshots: normalized.includeWebSnapshots,
        includeTelemetry: normalized.includeTelemetry,
        includeSourceMetadata: normalized.includeSourceMetadata,
        includeDrafts: normalized.includeDrafts,
      },
    },
  });
  await expect(prepareLibraryBackup(selectedOptions)).resolves.toBe(true);
});

it(
  'keeps selected dialog planning metadata-only and independent of proven unrelated ' +
    'conflicts while default local-only planning stays broad',
  async () => {
    const snapshot = runtimeCatalog([{ id: 'local' }, { id: 'other' }]);
    snapshot.roots.get(syncCatalogRootKey('video-project', 'other'))!.conflict = true;
    io.catalog.mockResolvedValue(snapshot);
    const options = createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: { mediaAssetIds: [], scenarioProjectIds: [], videoProjectIds: ['local'] },
    });
    await expect(planRetainedLibrary(options)).resolves.toMatchObject({ missing: [] });
    expect(io.prepare).not.toHaveBeenCalled();
    expect(io.library).not.toHaveBeenCalled();
    expect(io.receive).not.toHaveBeenCalled();
    expect(io.native).not.toHaveBeenCalled();
    expect(io.inventory).not.toHaveBeenCalled();
    await expect(planRetainedLibrary()).rejects.toThrow('conflict');
  }
);
