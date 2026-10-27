// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  commandSyncWorkspaceAllocation,
  createSyncWorkspaceAllocation,
  loadSyncWorkspaceAllocation,
} from './workspace-allocation';
import { withSyncConnectionAdmissionLock } from './coordination';
import { connectionUuid } from './model';
import { runWithPersistentDataErasureBarrier } from '../infrastructure/mutation-barrier';

const io = vi.hoisted(() => ({ database: vi.fn(), capture: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
  capturePreparedDatabase: io.capture,
}));
let lockObserved: ((name: string) => void) | null = null;
const input = { parentUrl: 'https://dav.example.test/selected/', accountId: 'alice' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  lockObserved = null;
  vi.stubGlobal('crypto', webcrypto);
  const pending = new Map<string, Promise<unknown>>();
  const exclusiveRequests = new Map<string, number>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        name: string,
        options: { mode: string; ifAvailable?: boolean },
        callback: (lock?: unknown) => unknown
      ) => {
        lockObserved?.(name);
        if (options.ifAvailable && exclusiveRequests.has(name))
          return Promise.resolve(callback(null));
        if (options.mode === 'exclusive')
          exclusiveRequests.set(name, (exclusiveRequests.get(name) ?? 0) + 1);
        const result = (pending.get(name) ?? Promise.resolve())
          .then(() => callback({}))
          .finally(() => {
            if (options.mode !== 'exclusive') return;
            const remaining = (exclusiveRequests.get(name) ?? 1) - 1;
            if (remaining) exclusiveRequests.set(name, remaining);
            else exclusiveRequests.delete(name);
          });
        pending.set(
          name,
          result.catch(() => undefined)
        );
        return result;
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

/** Atomic snapshot fixture: put only changes a private transaction until done succeeds. */
function setup() {
  const rows = new Map<string, Map<string, unknown>>([
    ['sync_capture', new Map()],
    ['sync_connection', new Map()],
  ]);
  const modes: string[] = [];
  let failCommit = false;
  let aborts = 0;
  let drains = 0;
  const makeDatabase = () => {
    const database = {
      closed: false,
      transaction(stores: string[], mode: string) {
        if (database.closed) throw new DOMException('Closed database', 'InvalidStateError');
        modes.push(mode);
        const pending = structuredClone(rows);
        let aborted = false;
        let completed = false;
        return {
          abort() {
            aborted = true;
            aborts += 1;
          },
          objectStore(name: string) {
            if (!stores.includes(name)) throw new Error('Store outside transaction');
            const table = pending.get(name)!;
            return {
              get: async (key: string) => structuredClone(table.get(key)),
              put: async (value: unknown) => {
                if (mode !== 'readwrite') throw new Error('Readonly write');
                if (!isRecord(value) || typeof value['key'] !== 'string')
                  throw new Error('Invalid fixture row');
                table.set(value['key'], structuredClone(value));
              },
            };
          },
          get done() {
            if (aborted) {
              drains += 1;
              return Promise.reject(new DOMException('Aborted', 'AbortError'));
            }
            if (mode === 'readwrite' && failCommit) {
              failCommit = false;
              return Promise.reject(new DOMException('Late backend failure', 'QuotaExceededError'));
            }
            if (!completed && mode === 'readwrite') {
              rows.clear();
              for (const [name, table] of pending) rows.set(name, table);
            }
            completed = true;
            return Promise.resolve();
          },
        };
      },
    };
    return database;
  };
  let database = makeDatabase();
  io.database.mockResolvedValue(database);
  io.capture.mockImplementation(() => database);
  return {
    erase() {
      database.closed = true;
      for (const table of rows.values()) table.clear();
      database = makeDatabase();
      io.database.mockResolvedValue(database);
    },
    rows,
    modes,
    table: (name = 'sync_connection') => rows.get(name)!,
    failCommit() {
      failCommit = true;
    },
    aborted: () => aborts,
    drained: () => drains,
  };
}
it('creates a native singleton plan without credentials or capture enrollment', async () => {
  const f = setup();
  expect(await loadSyncWorkspaceAllocation()).toBeNull();
  const planned = await createSyncWorkspaceAllocation(input);
  expect(planned).toMatchObject({
    ...input,
    version: 1,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    phase: 'planned',
    identity: { revision: 1 },
  });
  expect(connectionUuid(planned.spaceId)).toBe(true);
  expect(connectionUuid(planned.bootstrapId)).toBe(true);
  expect(connectionUuid(planned.identity.incarnation)).toBe(true);
  expect(planned.rootUrl).toBe(`${input.parentUrl}Sniptale-${planned.bootstrapId}/`);
  expect(f.table('sync_capture').size).toBe(0);
  expect([...f.table().keys()]).toEqual(['workspace-allocation']);
  expect(await loadSyncWorkspaceAllocation()).toEqual(planned);
});
it('serializes parallel opening plans and admits exactly one active attempt', async () => {
  setup();
  const results = await Promise.allSettled([
    createSyncWorkspaceAllocation(input),
    createSyncWorkspaceAllocation(input),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect((await loadSyncWorkspaceAllocation())?.phase).toBe('planned');
});
it('requires exact phase and revision and replaces only explicitly abandoned attempts', async () => {
  setup();
  const planned = await createSyncWorkspaceAllocation(input);
  await expect(commandSyncWorkspaceAllocation(planned.identity, 'confirm')).rejects.toThrow(
    'refused'
  );
  await expect(createSyncWorkspaceAllocation(input, planned.identity)).rejects.toThrow('refused');
  const allocating = await commandSyncWorkspaceAllocation(planned.identity, 'allocate');
  expect(allocating.identity.revision).toBe(2);
  await expect(commandSyncWorkspaceAllocation(planned.identity, 'allocate')).rejects.toThrow(
    'refused'
  );
  await expect(commandSyncWorkspaceAllocation(allocating.identity, 'allocate')).rejects.toThrow(
    'refused'
  );
  expect(await loadSyncWorkspaceAllocation()).toEqual(allocating);
  const allocated = await commandSyncWorkspaceAllocation(allocating.identity, 'confirm');
  expect(allocated).toEqual({
    ...allocating,
    phase: 'allocated',
    identity: { ...allocating.identity, revision: 3 },
  });
  await expect(commandSyncWorkspaceAllocation(allocated.identity, 'confirm')).rejects.toThrow(
    'refused'
  );
  const abandoned = await commandSyncWorkspaceAllocation(allocated.identity, 'abandon');
  await expect(commandSyncWorkspaceAllocation(abandoned.identity, 'abandon')).rejects.toThrow(
    'refused'
  );
  await expect(createSyncWorkspaceAllocation(input)).rejects.toThrow('refused');
  await expect(createSyncWorkspaceAllocation(input, allocated.identity)).rejects.toThrow('refused');
  const next = await createSyncWorkspaceAllocation(input, abandoned.identity);
  expect(next.phase).toBe('planned');
  expect(next.identity.incarnation).not.toBe(planned.identity.incarnation);
  expect(next.rootUrl).not.toBe(planned.rootUrl);
});
it.each(['planned', 'allocating'] as const)(
  'can explicitly abandon %s without remote effects',
  async (phase) => {
    setup();
    let row = await createSyncWorkspaceAllocation(input);
    if (phase === 'allocating')
      row = await commandSyncWorkspaceAllocation(row.identity, 'allocate');
    const abandoned = await commandSyncWorkspaceAllocation(row.identity, 'abandon');
    expect(abandoned).toEqual({
      ...row,
      phase: 'abandoned',
      identity: { ...row.identity, revision: row.identity.revision + 1 },
    });
  }
);
it.each(['missing', 'erase', 'recreate'] as const)(
  'refuses delayed callbacks after %s without resurrecting allocation',
  async (change) => {
    const f = setup();
    const planned = await createSyncWorkspaceAllocation(input);
    const allocating = await commandSyncWorkspaceAllocation(planned.identity, 'allocate');
    const entered = deferred();
    const release = deferred();
    const pending = (async () => {
      entered.resolve();
      await release.promise;
      return commandSyncWorkspaceAllocation(allocating.identity, 'confirm');
    })();
    await entered.promise;
    f.table().clear();
    if (change === 'erase') f.table('sync_capture').clear();
    if (change === 'recreate') {
      const replacement = await createSyncWorkspaceAllocation(input);
      await commandSyncWorkspaceAllocation(replacement.identity, 'allocate');
    }
    const before = structuredClone(f.rows);
    release.resolve();
    await expect(pending).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
  }
);
it('aborts and drains late backend failure and permits an explicit retry from unchanged state', async () => {
  const f = setup();
  f.failCommit();
  await expect(createSyncWorkspaceAllocation(input)).rejects.toThrow('Late backend failure');
  expect(f.table().size).toBe(0);
  const planned = await createSyncWorkspaceAllocation(input);
  const before = structuredClone(f.rows);
  f.failCommit();
  await expect(commandSyncWorkspaceAllocation(planned.identity, 'allocate')).rejects.toThrow(
    'Late backend failure'
  );
  expect(f.rows).toEqual(before);
  expect(f.aborted()).toBe(2);
  expect(f.drained()).toBe(2);
  expect((await commandSyncWorkspaceAllocation(planned.identity, 'allocate')).phase).toBe(
    'allocating'
  );
});
it('detaches caller inputs before waiting for native admission', async () => {
  setup();
  const entered = deferred();
  const release = deferred();
  const gate = withSyncConnectionAdmissionLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const caller = { ...input };
  const pending = createSyncWorkspaceAllocation(caller);
  caller.accountId = 'bob';
  caller.parentUrl = 'https://other.example.test/';
  release.resolve();
  await gate;
  const planned = await pending;
  expect(planned.accountId).toBe(input.accountId);
  expect(planned.parentUrl).toBe(input.parentUrl);
  const identity = { ...planned.identity };
  const command = commandSyncWorkspaceAllocation(identity, 'allocate');
  identity.incarnation = crypto.randomUUID();
  identity.revision = 90;
  expect((await command).identity.revision).toBe(2);
});
it('checks installed profile and connection in the same transaction and preserves them', async () => {
  const f = setup();
  for (const store of ['sync_capture', 'sync_connection']) {
    const key = store === 'sync_capture' ? 'profile' : 'connection';
    f.table(store).set(key, { malformed: true });
    const before = structuredClone(f.rows);
    await expect(createSyncWorkspaceAllocation(input)).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
    f.table(store).clear();
  }
  const planned = await createSyncWorkspaceAllocation(input);
  f.table('sync_capture').set('profile', { installed: true });
  const before = structuredClone(f.rows);
  await expect(commandSyncWorkspaceAllocation(planned.identity, 'allocate')).rejects.toThrow(
    'refused'
  );
  expect(f.rows).toEqual(before);
});
it('refuses unknown persisted rows with readonly loads and no repair', async () => {
  const f = setup();
  const planned = await createSyncWorkspaceAllocation(input);
  const corruptions = [
    { ...planned, extra: true },
    { ...planned, version: 2 },
    { ...planned, rootUrl: `${input.parentUrl}other/` },
    { ...planned, spaceId: 'caller' },
    { ...planned, identity: { ...planned.identity, extra: true } },
    { ...planned, phase: 'future' },
    { ...planned, accountId: 'bad\naccount' },
  ];
  for (const row of corruptions) {
    f.table().set('workspace-allocation', row);
    const before = structuredClone(f.rows);
    f.modes.length = 0;
    await expect(loadSyncWorkspaceAllocation()).rejects.toThrow('refused');
    expect(f.modes).toEqual(['readonly']);
    await expect(createSyncWorkspaceAllocation(input)).rejects.toThrow('refused');
    await expect(commandSyncWorkspaceAllocation(planned.identity, 'abandon')).rejects.toThrow(
      'refused'
    );
    expect(f.rows).toEqual(before);
  }
});
it('refuses caller IDs malformed URLs and unknown commands before writing', async () => {
  const f = setup();
  for (const bad of [
    { ...input, spaceId: crypto.randomUUID() },
    { ...input, bootstrapId: crypto.randomUUID() },
    { ...input, accountId: '' },
    { ...input, parentUrl: 'http://dav.example.test/' },
    { ...input, parentUrl: 'https://alice:secret@dav.example.test/' },
    { ...input, parentUrl: 'https://dav.example.test/root' },
    { ...input, parentUrl: 'https://dav.example.test/root/?query' },
    { ...input, parentUrl: 'https://dav.example.test/a/../' },
  ])
    await expect(createSyncWorkspaceAllocation(bad)).rejects.toThrow('refused');
  await expect(
    createSyncWorkspaceAllocation(input, { incarnation: crypto.randomUUID(), revision: 1 })
  ).rejects.toThrow('refused');
  expect(f.table().size).toBe(0);
  const planned = await createSyncWorkspaceAllocation(input);
  await expect(
    commandSyncWorkspaceAllocation(planned.identity, { action: 'allocate' })
  ).rejects.toThrow('refused');
  expect(await loadSyncWorkspaceAllocation()).toEqual(planned);
});

it('refuses a queued opening after erasure instead of writing into a recreated database', async () => {
  const f = setup();
  const entered = deferred();
  const release = deferred();
  const held = withSyncConnectionAdmissionLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const queued = deferred();
  lockObserved = (name) => {
    if (name === 'sniptale.sync-connection.admission') queued.resolve();
  };
  const opening = createSyncWorkspaceAllocation(input);
  const observed = opening.then(
    () => 'written',
    () => 'refused'
  );
  await queued.promise;
  await runWithPersistentDataErasureBarrier(() => f.erase());
  release.resolve();
  await held;
  expect(await observed).toBe('refused');
  expect(f.table().size).toBe(0);
});

it('refuses an opening admitted during erasure without recreating the database', async () => {
  const f = setup();
  const entered = deferred();
  const release = deferred();
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    entered.resolve();
    await release.promise;
    f.erase();
  });
  await entered.promise;
  const calls = io.database.mock.calls.length;
  const opening = createSyncWorkspaceAllocation(input);
  const observed = opening.then(
    () => 'written',
    () => 'refused'
  );
  release.resolve();
  await erasure;
  expect(await observed).toBe('refused');
  expect(io.database).toHaveBeenCalledTimes(calls);
  expect(f.table().size).toBe(0);
});

it('refuses cold database admission and leaves preparation to the connection page', async () => {
  const f = setup();
  io.capture.mockReturnValueOnce(null);
  await expect(createSyncWorkspaceAllocation(input)).rejects.toThrow('refused');
  expect(io.database).not.toHaveBeenCalled();
  expect(f.modes).toEqual([]);
  expect(f.table().size).toBe(0);
});

it('waits for ordinary database preparation without refusing a valid opening', async () => {
  const f = setup();
  const entered = deferred();
  const release = deferred();
  const preparation = runWithPersistentDataErasureBarrier(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const opening = createSyncWorkspaceAllocation(input);
  release.resolve();
  await preparation;
  expect((await opening).phase).toBe('planned');
  expect(f.table().size).toBe(1);
  expect(io.database).not.toHaveBeenCalled();
});
