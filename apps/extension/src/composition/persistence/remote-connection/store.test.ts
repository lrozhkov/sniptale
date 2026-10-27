// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { encryptSecret, decryptSecret } from '@sniptale/platform/security/local-secret-crypto';
import {
  beginSyncConnectionAuthUpdate,
  commitSyncConnectionAuthentication,
  commandSyncConnection,
  loadSyncConnection,
  loadSyncConnectionAuthentication,
  checkSyncConnectionAdmission,
} from './store';
import {
  parseConnectionMetadata,
  type SyncConnectionBinding,
  type SyncConnectionMetadata,
} from './model';
import { encodeSyncWorkspaceMarker } from '../../../contracts/sync-workspace';
import { withSyncConnectionAdmissionLock } from './coordination';

const io = vi.hoisted(() => ({ database: vi.fn(), encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('@sniptale/platform/security/local-secret-crypto', async (original) => {
  const actual = await original<typeof import('@sniptale/platform/security/local-secret-crypto')>();
  return { ...actual, encryptSecret: io.encrypt, decryptSecret: io.decrypt };
});
const binding: SyncConnectionBinding = {
  provider: 'webdav',
  rootUrl: 'https://dav.example.test/root/',
  accountId: 'alice',
  spaceId: 'space',
  connectionGeneration: 3,
  profileCreatedAt: 1,
};
const basic = { kind: 'basic', username: 'alice', password: 'synthetic-password' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  const actual = await vi.importActual<
    typeof import('@sniptale/platform/security/local-secret-crypto')
  >('@sniptale/platform/security/local-secret-crypto');
  io.encrypt.mockImplementation(actual.encryptSecret);
  io.decrypt.mockImplementation(actual.decryptSecret);
  const pending = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (name: string, _options: unknown, callback: () => unknown) => {
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

/** Atomic snapshot fixture commits only through done and includes structured-cloned CryptoKeys. */
function setup(spaceId = 'space') {
  const rows = new Map<string, Map<string, unknown>>([
    [
      'sync_capture',
      new Map([
        [
          'profile',
          {
            version: 1,
            kind: 'profile',
            key: 'profile',
            createdAt: 1,
            enabled: true,
            spaceId,
            connectionGeneration: 3,
          },
        ],
      ]),
    ],
    ['sync_connection', new Map()],
  ]);
  let failAt = 0;
  let writes = 0;
  const database = {
    transaction(stores: string[], mode: string) {
      const pending = structuredClone(rows);
      let aborted = false;
      return {
        abort() {
          aborted = true;
        },
        objectStore(name: string) {
          if (!stores.includes(name)) throw new Error('Store outside transaction');
          const table = pending.get(name)!;
          return {
            get: async (key: string) => structuredClone(table.get(key)),
            put: async (value: unknown) => {
              writes += 1;
              if (failAt === writes) throw new DOMException('No space', 'QuotaExceededError');
              if (!isRecord(value) || typeof value['key'] !== 'string')
                throw new Error('Invalid fixture row');
              table.set(value['key'], structuredClone(value));
            },
          };
        },
        get done() {
          if (aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
          if (mode === 'readwrite') {
            rows.clear();
            for (const [name, table] of pending) rows.set(name, table);
          }
          return Promise.resolve();
        },
      };
    },
  };
  io.database.mockResolvedValue(database);
  return {
    rows,
    database,
    table: (name = 'sync_connection') => rows.get(name)!,
    failWrite(index: number) {
      writes = 0;
      failAt = index;
    },
  };
}
async function activate() {
  const reservation = await beginSyncConnectionAuthUpdate(binding, null);
  return commitSyncConnectionAuthentication(reservation, basic);
}
function credential(f: ReturnType<typeof setup>) {
  const row = f.table().get('credential');
  if (!isRecord(row)) throw new Error('Missing fixture credential');
  return row;
}
it('configures separate metadata and credentials without plaintext or exportable keys', async () => {
  const f = setup();
  const profile = structuredClone(f.table('sync_capture'));
  expect(await loadSyncConnection()).toBeNull();
  expect(f.table().size).toBe(0);
  const active = await activate();
  expect(active).toMatchObject({ phase: 'active', identity: { revision: 2 } });
  expect([...f.table().keys()].sort()).toEqual(['connection', 'credential']);
  expect(JSON.stringify(f.rows.get('sync_connection'))).not.toContain(basic.password);
  expect(JSON.stringify([...f.table().values()])).not.toContain(basic.password);
  expect(JSON.stringify([...f.table().values()])).not.toContain('material');
  const key = credential(f)['cryptoKey'];
  expect(key).toMatchObject({
    type: 'secret',
    extractable: false,
    algorithm: { name: 'AES-GCM', length: 256 },
    usages: ['encrypt', 'decrypt'],
  });
  if (!(key instanceof CryptoKey)) throw new Error('Invalid fixture CryptoKey');
  await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(basic);
  expect(f.table('sync_capture')).toEqual(profile);
});
it('pauses and resumes without changing capture enrollment or namespace generation', async () => {
  const f = setup();
  const active = await activate();
  const before = structuredClone(f.table('sync_capture'));
  const secret = credential(f);
  const paused = await commandSyncConnection(active.identity, 'pause');
  await expect(loadSyncConnectionAuthentication(paused.identity)).rejects.toThrow('refused');
  await expect(loadSyncConnectionAuthentication(active.identity)).rejects.toThrow('refused');
  const resumed = await commandSyncConnection(paused.identity, 'resume');
  expect(await loadSyncConnectionAuthentication(resumed.identity)).toEqual(basic);
  expect(f.table('sync_capture')).toEqual(before);
  expect(credential(f)).toEqual(secret);
});
it('refuses implicit account root and scope retargets and malformed metadata without repair', async () => {
  const f = setup();
  const active = await activate();
  const before = structuredClone(f.rows);
  for (const change of [
    { accountId: 'bob' },
    { rootUrl: 'https://other.example.test/' },
    { spaceId: 'other' },
    { profileCreatedAt: 2 },
  ]) {
    await expect(
      beginSyncConnectionAuthUpdate({ ...binding, ...change }, active.identity)
    ).rejects.toThrow('refused');
  }
  expect(f.rows).toEqual(before);
  f.table().set('connection', { ...active, unknownSecret: basic.password });
  const malformed = structuredClone(f.rows);
  await expect(loadSyncConnection()).rejects.toThrow('refused');
  expect(f.rows).toEqual(malformed);
});
it('detaches auth and reservation before the first crypto await and refuses malformed credentials', async () => {
  setup();
  const reservation = await beginSyncConnectionAuthUpdate(binding, null);
  const callerReservation = structuredClone(reservation);
  const callerAuth = structuredClone(basic);
  const pending = commitSyncConnectionAuthentication(callerReservation, callerAuth);
  callerReservation.updateNonce = crypto.randomUUID();
  callerAuth.password = 'changed';
  const active = await pending;
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(basic);
  for (const authentication of [
    { ...basic, username: 'bob' },
    { ...basic, password: 'bad\r\nheader' },
    { kind: 'bearer', accessToken: 'bad\nheader' },
    { ...basic, extra: true },
  ]) {
    const update = await beginSyncConnectionAuthUpdate(
      binding,
      (await loadSyncConnection())!.identity
    );
    await expect(commitSyncConnectionAuthentication(update, authentication)).rejects.toThrow(
      'refused'
    );
    expect((await loadSyncConnection())!.phase).toBe('updating-auth');
  }
});
it('durably closes a reservation before crypto and lets only a later explicit update win', async () => {
  setup();
  const first = await beginSyncConnectionAuthUpdate(binding, null);
  const entered = deferred<void>();
  const release = deferred<void>();
  io.encrypt.mockImplementationOnce(async (...args: Parameters<typeof encryptSecret>) => {
    entered.resolve();
    await release.promise;
    const actual = await vi.importActual<
      typeof import('@sniptale/platform/security/local-secret-crypto')
    >('@sniptale/platform/security/local-secret-crypto');
    return actual.encryptSecret(...args);
  });
  const pending = commitSyncConnectionAuthentication(first, basic);
  await entered.promise;
  expect((await loadSyncConnection())!.phase).toBe('updating-auth');
  await expect(loadSyncConnectionAuthentication(first.identity)).rejects.toThrow('refused');
  const later = await beginSyncConnectionAuthUpdate(binding, first.identity);
  const active = await commitSyncConnectionAuthentication(later, {
    kind: 'bearer',
    accessToken: 'synthetic-token',
  });
  release.resolve();
  await expect(pending).rejects.toThrow('refused');
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual({
    kind: 'bearer',
    accessToken: 'synthetic-token',
  });
});
it('serializes parallel opening writers and keeps an exact stale command from replacing state', async () => {
  setup();
  const first = beginSyncConnectionAuthUpdate(binding, null);
  const second = beginSyncConnectionAuthUpdate(binding, null);
  const accepted = await first;
  await expect(second).rejects.toThrow('refused');
  const active = await commitSyncConnectionAuthentication(accepted, basic);
  await expect(beginSyncConnectionAuthUpdate(binding, accepted.identity)).rejects.toThrow(
    'refused'
  );
  await expect(commandSyncConnection(accepted.identity, 'pause')).rejects.toThrow('refused');
  expect(await loadSyncConnection()).toEqual(active);
});
it.each(['remove', 'erase', 'recreate', 'profile-replace'] as const)(
  'refuses delayed encryption after %s and never resurrects missing authority',
  async (change) => {
    const f = setup();
    const reservation = await beginSyncConnectionAuthUpdate(binding, null);
    const entered = deferred<void>();
    const release = deferred<void>();
    io.encrypt.mockImplementationOnce(async (...args: Parameters<typeof encryptSecret>) => {
      entered.resolve();
      await release.promise;
      const actual = await vi.importActual<
        typeof import('@sniptale/platform/security/local-secret-crypto')
      >('@sniptale/platform/security/local-secret-crypto');
      return actual.encryptSecret(...args);
    });
    const pending = commitSyncConnectionAuthentication(reservation, basic);
    await entered.promise;
    if (change === 'profile-replace')
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: 2,
        enabled: true,
        spaceId: 'space',
        connectionGeneration: 3,
      });
    else {
      f.table().clear();
      if (change === 'erase') f.table('sync_capture').clear();
      if (change === 'recreate') await beginSyncConnectionAuthUpdate(binding, null);
    }
    const before = structuredClone(f.rows);
    release.resolve();
    await expect(pending).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
  }
);
it.each(['rotate', 'remove', 'erase', 'recreate', 'profile-replace'] as const)(
  'refuses delayed decryption after %s',
  async (change) => {
    const f = setup();
    const active = await activate();
    const entered = deferred<void>();
    const release = deferred<void>();
    io.decrypt.mockImplementationOnce(async (...args: Parameters<typeof decryptSecret>) => {
      entered.resolve();
      await release.promise;
      const actual = await vi.importActual<
        typeof import('@sniptale/platform/security/local-secret-crypto')
      >('@sniptale/platform/security/local-secret-crypto');
      return actual.decryptSecret(...args);
    });
    const pending = loadSyncConnectionAuthentication(active.identity);
    await entered.promise;
    if (change === 'profile-replace')
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: 2,
        enabled: true,
        spaceId: 'space',
        connectionGeneration: 3,
      });
    else if (change === 'rotate') {
      const reservation = await beginSyncConnectionAuthUpdate(binding, active.identity);
      await commitSyncConnectionAuthentication(reservation, basic);
    } else {
      f.table().clear();
      if (change === 'erase') f.table('sync_capture').clear();
      if (change === 'recreate') await activate();
    }
    const before = structuredClone(f.rows);
    release.resolve();
    await expect(pending).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
  }
);
it('preserves the closed reservation and old credential after failed atomic commit and permits retry', async () => {
  const f = setup();
  const active = await activate();
  const reservation = await beginSyncConnectionAuthUpdate(binding, active.identity);
  const before = structuredClone(f.rows);
  f.failWrite(2);
  await expect(
    commitSyncConnectionAuthentication(reservation, { kind: 'bearer', accessToken: 'new-token' })
  ).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  expect((await loadSyncConnection())!.phase).toBe('updating-auth');
  f.failWrite(0);
  const next = await commitSyncConnectionAuthentication(reservation, {
    kind: 'bearer',
    accessToken: 'new-token',
  });
  expect(await loadSyncConnectionAuthentication(next.identity)).toEqual({
    kind: 'bearer',
    accessToken: 'new-token',
  });
});
it('keeps failed encryption closed and permits an explicit retry without losing previous credentials', async () => {
  const f = setup();
  const active = await activate();
  const reservation = await beginSyncConnectionAuthUpdate(binding, active.identity);
  const before = structuredClone(f.rows);
  io.encrypt.mockRejectedValueOnce(new Error('Synthetic encryption failure'));
  await expect(commitSyncConnectionAuthentication(reservation, basic)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
  await expect(loadSyncConnectionAuthentication(reservation.identity)).rejects.toThrow('refused');
  const next = await commitSyncConnectionAuthentication(reservation, basic);
  expect(await loadSyncConnectionAuthentication(next.identity)).toEqual(basic);
});
it('preserves empty storage after failed opening and permits the same explicit retry', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  f.failWrite(1);
  await expect(beginSyncConnectionAuthUpdate(binding, null)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  f.failWrite(0);
  expect((await beginSyncConnectionAuthUpdate(binding, null)).phase).toBe('updating-auth');
});
it('rejects swapped AAD and exportable key envelopes without writes', async () => {
  const f = setup();
  const active = await activate();
  const original = credential(f);
  const envelope = original['envelope'];
  if (!isRecord(envelope) || !isRecord(envelope['additionalData']))
    throw new Error('Missing fixture envelope');
  f.table().set('credential', {
    ...original,
    envelope: { ...envelope, additionalData: { ...envelope['additionalData'], accountId: 'bob' } },
  });
  const tampered = structuredClone(f.rows);
  await expect(loadSyncConnectionAuthentication(active.identity)).rejects.toThrow('refused');
  expect(f.rows).toEqual(tampered);
  const exportable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  f.table().set('credential', { ...original, cryptoKey: exportable });
  await expect(loadSyncConnectionAuthentication(active.identity)).rejects.toThrow('refused');
});
it('checks queue admission atomically and admits legacy null identity only before configuration', async () => {
  const f = setup();
  // The fixture implements the same required read surface; production callers supply their IDB transaction.
  const run = async (identity: SyncConnectionMetadata['identity'] | null) => {
    const db = await import('../infrastructure/indexed-db/core');
    const native = await db.initDB();
    const tx = native.transaction(['sync_capture', 'sync_connection'], 'readonly');
    return checkSyncConnectionAdmission(tx, binding, identity);
  };
  expect(await run(null)).toBeNull();
  const active = await activate();
  await expect(run(null)).rejects.toThrow('refused');
  expect(await run(active.identity)).toEqual(active);
  const paused = await commandSyncConnection(active.identity, 'pause');
  await expect(run(active.identity)).rejects.toThrow('refused');
  await expect(run(paused.identity)).rejects.toThrow('refused');
  expect(f.table('sync_capture').get('profile')).toMatchObject({
    enabled: true,
    connectionGeneration: 3,
  });
});
it('releases the admission lock after the short callback and fails closed without native locks', async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const first = withSyncConnectionAdmissionLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const order: string[] = [];
  const second = withSyncConnectionAdmissionLock(() => {
    order.push('second');
  });
  expect(order).toEqual([]);
  release.resolve();
  await Promise.all([first, second]);
  expect(order).toEqual(['second']);
  vi.stubGlobal('navigator', {});
  expect(() => withSyncConnectionAdmissionLock(() => undefined)).toThrow();
});

it('preserves legacy metadata shape and credential context', async () => {
  const f = setup();
  const active = await activate();
  expect(active).not.toHaveProperty('workspace');
  expect(parseConnectionMetadata(active)).toEqual(active);
  expect(credential(f)['envelope']).toMatchObject({
    additionalData: {
      version: 'sync-connection-secret:v1',
      spaceId: binding.spaceId,
    },
  });
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(basic);
});
it('binds checked workspace identity into credentials and auth rotation', async () => {
  const workspace = encodeSyncWorkspaceMarker(crypto.randomUUID(), crypto.randomUUID()).identity;
  const f = setup(workspace.spaceId);
  const selectedBinding = { ...binding, spaceId: workspace.spaceId };
  const initial = await beginSyncConnectionAuthUpdate(selectedBinding, null);
  const reservation = { ...initial, workspace };
  f.table().set('connection', structuredClone(reservation));
  const active = await commitSyncConnectionAuthentication(reservation, basic);
  expect(active.workspace).toEqual(workspace);
  expect(credential(f)['envelope']).toMatchObject({
    additionalData: {
      version: 'sync-connection-secret:v2',
      spaceId: workspace.spaceId,
      bootstrapId: workspace.bootstrapId,
      fingerprint: workspace.fingerprint,
    },
  });
  expect(await loadSyncConnectionAuthentication(active.identity)).toEqual(basic);
  const update = await beginSyncConnectionAuthUpdate(selectedBinding, active.identity);
  expect(update.workspace).toEqual(workspace);
  const rotated = await commitSyncConnectionAuthentication(update, {
    kind: 'bearer',
    accessToken: 'replacement-token',
  });
  expect(rotated.workspace).toEqual(workspace);
  expect(credential(f)['envelope']).toMatchObject({
    additionalData: {
      version: 'sync-connection-secret:v2',
      bootstrapId: workspace.bootstrapId,
      fingerprint: workspace.fingerprint,
    },
  });
  expect(await loadSyncConnectionAuthentication(rotated.identity)).toEqual({
    kind: 'bearer',
    accessToken: 'replacement-token',
  });
});
it('refuses null malformed and mismatched optional workspace identity', async () => {
  const f = setup();
  const active = await activate();
  const workspace = encodeSyncWorkspaceMarker(crypto.randomUUID(), crypto.randomUUID()).identity;
  for (const value of [null, undefined, {}, workspace, { ...workspace, fingerprint: 'invalid' }]) {
    const malformed = { ...active, workspace: value };
    expect(parseConnectionMetadata(malformed)).toBeNull();
    f.table().set('connection', malformed);
    const before = structuredClone(f.rows);
    await expect(loadSyncConnection()).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
  }
});
it('refuses changed workspace identity and legacy context for enrolled credentials', async () => {
  const workspace = encodeSyncWorkspaceMarker(crypto.randomUUID(), crypto.randomUUID()).identity;
  const f = setup(workspace.spaceId);
  const initial = await beginSyncConnectionAuthUpdate(
    { ...binding, spaceId: workspace.spaceId },
    null
  );
  const reservation = { ...initial, workspace };
  f.table().set('connection', structuredClone(reservation));
  const active = await commitSyncConnectionAuthentication(reservation, basic);
  const original = credential(f);
  for (const changed of [
    { ...workspace, bootstrapId: crypto.randomUUID() },
    { ...workspace, fingerprint: '0'.repeat(64) },
  ]) {
    f.table().set('connection', { ...active, workspace: changed });
    await expect(loadSyncConnectionAuthentication(active.identity)).rejects.toThrow('refused');
  }
  f.table().set('connection', active);
  const envelope = original['envelope'];
  if (!isRecord(envelope) || !isRecord(envelope['additionalData']))
    throw new Error('Missing fixture envelope');
  f.table().set('credential', {
    ...original,
    envelope: {
      ...envelope,
      additionalData: { ...envelope['additionalData'], version: 'sync-connection-secret:v1' },
    },
  });
  const before = structuredClone(f.rows);
  await expect(loadSyncConnectionAuthentication(active.identity)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
});
