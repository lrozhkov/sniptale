// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { encryptSecret } from '@sniptale/platform/security/local-secret-crypto';
import { encodeSyncWorkspaceMarker } from '../../../contracts/sync-workspace';
import {
  beginSyncConnectionAuthUpdate,
  commandSyncConnection,
  commitSyncConnectionAuthentication,
  enrollSyncWorkspaceConnection,
  loadSyncConnectionAuthentication,
} from './store';
import { withSyncConnectionAdmissionLock } from './coordination';
import {
  revokeSyncWorkspaceAllocation,
  type SyncWorkspaceAllocation,
} from './workspace-allocation';

const io = vi.hoisted(() => ({ database: vi.fn(), capture: vi.fn(), encrypt: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
  capturePreparedDatabase: io.capture,
}));
vi.mock('@sniptale/platform/security/local-secret-crypto', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/security/local-secret-crypto')>()),
  encryptSecret: io.encrypt,
}));
const authentication = { kind: 'basic', username: 'alice', password: 'synthetic-password' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let observeLock: ((name: string) => void) | null = null;
beforeEach(async () => {
  vi.clearAllMocks();
  observeLock = null;
  vi.stubGlobal('crypto', webcrypto);
  const actual = await vi.importActual<
    typeof import('@sniptale/platform/security/local-secret-crypto')
  >('@sniptale/platform/security/local-secret-crypto');
  io.encrypt.mockImplementation(actual.encryptSecret);
  const pending = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request(name: string, _options: unknown, callback: () => unknown) {
        observeLock?.(name);
        const result = (pending.get(name) ?? Promise.resolve()).then(callback);
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

function readyAllocation(): SyncWorkspaceAllocation {
  const spaceId = crypto.randomUUID();
  const bootstrapId = crypto.randomUUID();
  const marker = encodeSyncWorkspaceMarker(spaceId, bootstrapId);
  return {
    version: 2,
    kind: 'sync-workspace-allocation',
    key: 'workspace-allocation',
    provider: 'webdav',
    parentUrl: 'https://dav.example.test/selected/',
    rootUrl: `https://dav.example.test/selected/Sniptale-${bootstrapId}/`,
    accountId: 'alice',
    spaceId,
    bootstrapId,
    createdAt: 1,
    identity: { incarnation: crypto.randomUUID(), revision: 7 },
    phase: 'ready',
    marker: { text: marker.text, fingerprint: marker.identity.fingerprint },
  };
}

/** Private transaction snapshots publish only on done; erasure closes the captured handle. */
function setup() {
  const rows = new Map<string, Map<string, unknown>>([
    ['sync_capture', new Map()],
    ['sync_connection', new Map()],
    ['sync_outbox', new Map()],
  ]);
  const allocation = readyAllocation();
  rows.get('sync_connection')!.set('workspace-allocation', structuredClone(allocation));
  let failAt = 0;
  let writes = 0;
  let failCommit = false;
  let aborts = 0;
  let drains = 0;
  const makeDatabase = () => {
    const database = {
      closed: false,
      transaction(stores: string[], mode: string) {
        if (database.closed) throw new DOMException('Closed database', 'InvalidStateError');
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
              count: async () => table.size,
              put: async (value: unknown) => {
                if (mode !== 'readwrite') throw new Error('Readonly write');
                writes += 1;
                if (writes === failAt) throw new Error('Sensitive backend failure');
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
            if (database.closed) return Promise.reject(new Error('Closed database'));
            if (mode === 'readwrite' && failCommit) {
              failCommit = false;
              return Promise.reject(new Error('Sensitive commit failure'));
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
  io.capture.mockImplementation(() => database);
  io.database.mockImplementation(async () => database);
  return {
    rows,
    allocation,
    source: { kind: 'allocation', identity: structuredClone(allocation.identity) },
    table: (name = 'sync_connection') => rows.get(name)!,
    failWrite(index: number) {
      failAt = index;
      writes = 0;
    },
    failCommit() {
      failCommit = true;
    },
    aborted: () => aborts,
    drained: () => drains,
    erase() {
      database.closed = true;
      for (const table of rows.values()) table.clear();
      database = makeDatabase();
    },
  };
}
function holdEncryption() {
  const entered = deferred();
  const release = deferred();
  io.encrypt.mockImplementationOnce(async (...args: Parameters<typeof encryptSecret>) => {
    entered.resolve();
    await release.promise;
    const actual = await vi.importActual<
      typeof import('@sniptale/platform/security/local-secret-crypto')
    >('@sniptale/platform/security/local-secret-crypto');
    return actual.encryptSecret(...args);
  });
  return { entered: entered.promise, release: release.resolve };
}
it('installs one complete enrollment from native ready evidence', async () => {
  const f = setup();
  const active = await enrollSyncWorkspaceConnection(f.source, authentication);
  expect(active).toMatchObject({
    phase: 'active',
    identity: { revision: 1 },
    binding: {
      rootUrl: f.allocation.rootUrl,
      accountId: 'alice',
      spaceId: f.allocation.spaceId,
      connectionGeneration: 1,
    },
    workspace: {
      spaceId: f.allocation.spaceId,
      bootstrapId: f.allocation.bootstrapId,
      fingerprint: f.allocation.marker!.fingerprint,
    },
  });
  expect(f.table('sync_capture').get('profile')).toEqual({
    version: 1,
    kind: 'profile',
    key: 'profile',
    enabled: true,
    spaceId: f.allocation.spaceId,
    connectionGeneration: 1,
    createdAt: active.binding.profileCreatedAt,
  });
  expect([...f.table().keys()].sort()).toEqual([
    'connection',
    'credential',
    'workspace-allocation',
    'workspace-enrollment',
  ]);
  expect(f.table().get('workspace-allocation')).toEqual(f.allocation);
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(authentication);
  expect(JSON.stringify([...f.table().values()])).not.toContain(authentication.password);
  expect(io.database).toHaveBeenCalledTimes(2);
});
it('admits one complete enrollment for parallel writers', async () => {
  const f = setup();
  const [first, second] = await Promise.all([
    enrollSyncWorkspaceConnection(f.source, authentication),
    enrollSyncWorkspaceConnection(f.source, { ...authentication, password: 'different-password' }),
  ]);
  expect(second).toEqual(first);
  expect(f.table('sync_capture').size).toBe(1);
  expect(f.table().size).toBe(4);
  const resolved = await loadSyncConnectionAuthentication(first.identity);
  expect([authentication, { ...authentication, password: 'different-password' }]).toContainEqual(
    resolved
  );
});
it('replays the winning source without replacing credentials', async () => {
  const f = setup();
  const active = await enrollSyncWorkspaceConnection(f.source, authentication);
  const before = structuredClone(f.rows);
  io.encrypt.mockClear();
  expect(
    await enrollSyncWorkspaceConnection(f.source, {
      ...authentication,
      password: 'replacement-password',
    })
  ).toEqual(active);
  expect(io.encrypt).not.toHaveBeenCalled();
  expect(f.rows).toEqual(before);
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(authentication);
});
it('replays current same-binding state after pause resume and auth rotation', async () => {
  const f = setup();
  const active = await enrollSyncWorkspaceConnection(f.source, authentication);
  const paused = await commandSyncConnection(active.identity, 'pause');
  expect(await enrollSyncWorkspaceConnection(f.source, authentication)).toEqual(paused);
  const resumed = await commandSyncConnection(paused.identity, 'resume');
  const reservation = await beginSyncConnectionAuthUpdate(resumed.binding, resumed.identity);
  await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow('refused');
  const rotated = await commitSyncConnectionAuthentication(reservation, {
    kind: 'bearer',
    accessToken: 'synthetic-token',
  });
  expect(rotated.workspace).toEqual(active.workspace);
  expect(await enrollSyncWorkspaceConnection(f.source, authentication)).toEqual(rotated);
  expect(await loadSyncConnectionAuthentication(rotated.identity)).toEqual({
    kind: 'bearer',
    accessToken: 'synthetic-token',
  });
});
it.each([1, 2, 3, 4])('rolls back enrollment after write %s fails', async (index) => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failWrite(index);
  await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(f.aborted()).toBe(1);
  expect(f.drained()).toBe(1);
  f.failWrite(0);
  expect((await enrollSyncWorkspaceConnection(f.source, authentication)).phase).toBe('active');
});
it('aborts and drains failed enrollment before retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failCommit();
  await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(f.aborted()).toBe(1);
  expect(f.drained()).toBe(1);
  expect((await enrollSyncWorkspaceConnection(f.source, authentication)).phase).toBe('active');
});
it('preserves ready evidence after crypto failure and permits retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  io.encrypt.mockRejectedValueOnce(new Error('Sensitive encryption failure'));
  await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect((await enrollSyncWorkspaceConnection(f.source, authentication)).phase).toBe('active');
});
it.each(['stale', 'abandoned', 'marker', 'missing'] as const)(
  'refuses %s source evidence without repair',
  async (change) => {
    const f = setup();
    if (change === 'stale') f.source.identity.revision -= 1;
    if (change === 'abandoned')
      f.table().set('workspace-allocation', { ...f.allocation, phase: 'abandoned' });
    if (change === 'marker')
      f.table().set('workspace-allocation', {
        ...f.allocation,
        marker: { text: f.allocation.marker!.text, fingerprint: '0'.repeat(64) },
      });
    if (change === 'missing') f.table().delete('workspace-allocation');
    const before = structuredClone(f.rows);
    await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow(
      'refused'
    );
    expect(f.rows).toEqual(before);
    expect(io.encrypt).not.toHaveBeenCalled();
  }
);
it.each([
  { kind: 'join', identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 } },
  { kind: 'allocation', identity: null },
  null,
  { kind: 'allocation', identity: {}, rootUrl: 'https://other.example.test/' },
])('refuses malformed or unsupported source %#', async (source) => {
  const f = setup();
  const before = structuredClone(f.rows);
  await expect(enrollSyncWorkspaceConnection(source, authentication)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(io.encrypt).not.toHaveBeenCalled();
});
it.each(['capture', 'outbox', 'profile', 'connection', 'credential', 'unrelated'] as const)(
  'refuses existing %s rows without adoption or cleanup',
  async (kind) => {
    const f = setup();
    const store =
      kind === 'capture' || kind === 'profile'
        ? 'sync_capture'
        : kind === 'outbox'
          ? 'sync_outbox'
          : 'sync_connection';
    f.table(store).set(kind, { key: kind, retained: 'original-data' });
    const before = structuredClone(f.rows);
    await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow(
      'refused'
    );
    expect(f.rows).toEqual(before);
    expect(io.encrypt).not.toHaveBeenCalled();
  }
);
it.each([
  'source',
  'receipt',
  'binding',
  'workspace',
  'credential',
  'incarnation',
  'native-account',
  'profile',
  'unrelated',
] as const)('refuses changed %s during receipt replay', async (change) => {
  const f = setup();
  const active = await enrollSyncWorkspaceConnection(f.source, authentication);
  if (change === 'source')
    f.table().set('workspace-allocation', {
      ...f.allocation,
      identity: { ...f.allocation.identity, revision: f.allocation.identity.revision + 1 },
    });
  if (change === 'receipt') f.table().set('workspace-enrollment', { key: 'workspace-enrollment' });
  if (change === 'native-account')
    f.table().set('workspace-allocation', { ...f.allocation, accountId: 'bob' });
  if (change === 'profile') f.table('sync_capture').clear();
  if (change === 'unrelated') f.table().set('unrelated', { key: 'unrelated' });
  if (change === 'binding')
    f.table().set('connection', {
      ...active,
      binding: { ...active.binding, rootUrl: 'https://other.example.test/' },
    });
  if (change === 'workspace')
    f.table().set('connection', {
      ...active,
      workspace: { ...active.workspace, fingerprint: '0'.repeat(64) },
    });
  if (change === 'credential') f.table().delete('credential');
  if (change === 'incarnation')
    f.table().set('connection', {
      ...active,
      identity: { ...active.identity, incarnation: crypto.randomUUID() },
    });
  const before = structuredClone(f.rows);
  await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
});
it.each(['revision', 'binding', 'capture', 'outbox'] as const)(
  'refuses delayed enrollment after %s during crypto',
  async (change) => {
    const f = setup();
    const held = holdEncryption();
    const pending = enrollSyncWorkspaceConnection(f.source, authentication);
    await held.entered;
    if (change === 'revision')
      f.table().set('workspace-allocation', {
        ...f.allocation,
        identity: { ...f.allocation.identity, revision: f.allocation.identity.revision + 1 },
      });
    if (change === 'binding')
      f.table().set('workspace-allocation', { ...f.allocation, accountId: 'bob' });
    if (change === 'capture') f.table('sync_capture').set('retained', { key: 'retained' });
    if (change === 'outbox') f.table('sync_outbox').set('retained', { key: 'retained' });
    const before = structuredClone(f.rows);
    held.release();
    await expect(pending).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
  }
);
it('refuses delayed enrollment after source abandonment', async () => {
  const f = setup();
  const held = holdEncryption();
  const pending = enrollSyncWorkspaceConnection(f.source, authentication);
  await held.entered;
  await revokeSyncWorkspaceAllocation(f.allocation.identity.incarnation);
  const before = structuredClone(f.rows);
  held.release();
  await expect(pending).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
});
it('cannot reopen erased and recreated storage after crypto', async () => {
  const f = setup();
  const held = holdEncryption();
  const pending = enrollSyncWorkspaceConnection(f.source, authentication);
  await held.entered;
  f.erase();
  f.table().set('workspace-allocation', structuredClone(f.allocation));
  const before = structuredClone(f.rows);
  held.release();
  await expect(pending).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(io.database).not.toHaveBeenCalled();
});
it('captures the old handle before waiting for initial admission', async () => {
  const f = setup();
  const entered = deferred();
  const release = deferred();
  const blocker = withSyncConnectionAdmissionLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const pending = enrollSyncWorkspaceConnection(f.source, authentication);
  expect(io.capture).toHaveBeenCalledTimes(1);
  f.erase();
  f.table().set('workspace-allocation', structuredClone(f.allocation));
  const before = structuredClone(f.rows);
  release.resolve();
  await blocker;
  await expect(pending).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(io.database).not.toHaveBeenCalled();
});
it('refuses recreation while final admission waits', async () => {
  const f = setup();
  const held = holdEncryption();
  const pending = enrollSyncWorkspaceConnection(f.source, authentication);
  await held.entered;
  const entered = deferred();
  const release = deferred();
  const blocker = withSyncConnectionAdmissionLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const requested = deferred();
  observeLock = (name) => {
    if (name === 'sniptale.sync-connection.admission') requested.resolve();
  };
  held.release();
  await requested.promise;
  observeLock = null;
  f.erase();
  f.table().set('workspace-allocation', structuredClone(f.allocation));
  const before = structuredClone(f.rows);
  release.resolve();
  await blocker;
  await expect(pending).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  expect(io.database).not.toHaveBeenCalled();
});
it('refuses cold enrollment without opening the database', async () => {
  const f = setup();
  io.capture.mockReturnValue(null);
  await expect(enrollSyncWorkspaceConnection(f.source, authentication)).rejects.toThrow('refused');
  expect(io.database).not.toHaveBeenCalled();
  expect(io.encrypt).not.toHaveBeenCalled();
});
it('detaches inputs before asynchronous enrollment work', async () => {
  const f = setup();
  const callerSource = structuredClone(f.source);
  const callerAuth = structuredClone(authentication);
  const pending = enrollSyncWorkspaceConnection(callerSource, callerAuth);
  callerSource.identity.revision += 1;
  callerAuth.password = 'changed-password';
  const active = await pending;
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(authentication);
});
