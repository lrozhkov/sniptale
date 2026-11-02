// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createAesGcmKeyMaterial } from '@sniptale/platform/security/local-secret-crypto';
import { createWebdavSecretProtectionParticipant } from './protection';
import {
  beginSyncConnectionAuthUpdate,
  commitSyncConnectionAuthentication,
  commandSyncConnection,
  loadSyncConnection,
  loadSyncConnectionAuthentication,
} from './store';
import type { SyncConnectionBinding } from './model';
import {
  SecretProtectionAdmissionPermit,
  type PreparedSecretParticipant,
} from '../secret-protection/model';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  createSecretProtectionProfile,
  readSecretProtectionProfile,
  secretProtectionProfileBinding,
  writeSecretProtectionProfile,
} from '../secret-protection/profile.store';
const io = vi.hoisted(() => ({
  database: vi.fn(),
  profiles: new Map<string, unknown>(),
  activeNativeWrites: 0,
  profileLookup: vi.fn<() => Promise<void>>(),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
vi.mock('../infrastructure/browser-storage', async (original) => {
  const actual = await original<typeof import('../infrastructure/browser-storage')>();
  return {
    ...actual,
    browserStorage: {
      ...actual.browserStorage,
      local: {
        ...actual.browserStorage.local,
        get: async (keys: unknown) => {
          expect(io.activeNativeWrites).toBe(0);
          await io.profileLookup();
          const selected =
            typeof keys === 'string'
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : [...io.profiles.keys()];
          return Object.fromEntries(
            selected
              .filter((key): key is string => typeof key === 'string' && io.profiles.has(key))
              .map((key) => [key, structuredClone(io.profiles.get(key))])
          );
        },
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values))
            io.profiles.set(key, chromeStorageRoundTrip(value));
        },
      },
    },
  };
});

/** Chrome serializes dictionary properties in sorted order before returning a stored profile. */
function chromeStorageRoundTrip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(chromeStorageRoundTrip);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, chromeStorageRoundTrip(value[key])])
    );
  return value;
}

const selection: SyncConnectionBinding = {
  provider: 'webdav',
  rootUrl: 'https://dav.example.test/root/',
  accountId: 'alice',
  spaceId: 'space',
  connectionGeneration: 3,
  profileCreatedAt: 1,
};
const authentication = { kind: 'basic', username: 'alice', password: 'synthetic-password' };
const profileBinding = 'a'.repeat(64);
const nextProfileBinding = 'b'.repeat(64);
beforeEach(() => {
  vi.clearAllMocks();
  io.profiles.clear();
  io.activeNativeWrites = 0;
  io.profileLookup.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, _options: unknown, work: () => unknown) => work() },
  });
});
afterEach(() => vi.unstubAllGlobals());
function fixture() {
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
            spaceId: 'space',
            connectionGeneration: 3,
          },
        ],
      ]),
    ],
    ['sync_connection', new Map()],
    ['secret_protection', new Map()],
  ]);
  const database = {
    transaction(names: string[], mode: string) {
      const pending = structuredClone(rows);
      let aborted = false;
      let committed = false;
      let activeWrite = mode === 'readwrite';
      if (activeWrite) io.activeNativeWrites++;
      const closeWrite = () => {
        if (activeWrite) {
          activeWrite = false;
          io.activeNativeWrites--;
        }
      };
      return {
        abort() {
          aborted = true;
          closeWrite();
        },
        objectStore(name: string) {
          if (!names.includes(name)) throw new Error('Store outside transaction');
          const table = pending.get(name)!;
          return {
            get: async (key: string) => structuredClone(table.get(key)),
            put: async (value: unknown) => {
              if (!isRecord(value) || typeof value['key'] !== 'string')
                throw new Error('Invalid fixture row');
              table.set(value['key'], structuredClone(value));
            },
            delete: async (key: string) => {
              table.delete(key);
            },
          };
        },
        get done() {
          closeWrite();
          if (aborted) return Promise.reject(new Error('Aborted'));
          if (mode === 'readwrite' && !committed) {
            committed = true;
            rows.clear();
            for (const [name, table] of pending) rows.set(name, table);
          }
          return Promise.resolve();
        },
      };
    },
  };
  io.database.mockResolvedValue(database);
  return { rows, table: () => rows.get('sync_connection')!, database };
}
async function activate() {
  const reservation = await beginSyncConnectionAuthUpdate(selection, null);
  return commitSyncConnectionAuthentication(reservation, authentication);
}
async function protect() {
  const owner = createWebdavSecretProtectionParticipant();
  const { key } = await createAesGcmKeyMaterial();
  const prepared = await owner.prepare({
    action: 'protect',
    sourceKey: null,
    targetKey: key,
    sourceProfileBinding: null,
    targetProfileBinding: profileBinding,
  });
  await owner.apply(prepared);
  return { owner, key, prepared };
}
it('protects the existing credential with the common profile and no retained local key', async () => {
  const f = fixture();
  const connection = await activate();
  const { key } = await protect();
  const raw = f.table().get('credential');
  expect(raw).toEqual(
    expect.objectContaining({ version: 2, protection: { mode: 'passphrase', profileBinding } })
  );
  expect(raw).not.toHaveProperty('cryptoKey');
  await expect(loadSyncConnectionAuthentication(connection.identity)).rejects.toThrow();
  await expect(
    loadSyncConnectionAuthentication(connection.identity, key, profileBinding)
  ).resolves.toEqual(authentication);
  await expect(
    loadSyncConnectionAuthentication(connection.identity, key, nextProfileBinding)
  ).rejects.toThrow();
});
it('opts out with a fresh non-exportable local key while preserving the bound credential', async () => {
  const f = fixture();
  const connection = await activate();
  const { owner, key } = await protect();
  const prepared = await owner.prepare({
    action: 'unprotect',
    sourceKey: key,
    targetKey: null,
    sourceProfileBinding: profileBinding,
    targetProfileBinding: null,
  });
  expect(prepared.nativeKey?.extractable).toBe(false);
  expect(JSON.stringify(prepared.payload)).not.toContain(authentication.password);
  await owner.apply(prepared);
  await expect(loadSyncConnectionAuthentication(connection.identity)).resolves.toEqual(
    authentication
  );
  expect(f.table().get('credential')).toEqual(expect.objectContaining({ version: 1 }));
  expect(f.table().get('credential')).not.toHaveProperty('protection');
});
it('rekeys the protected credential and refuses the retired common key', async () => {
  fixture();
  const connection = await activate();
  const { owner, key } = await protect();
  const next = await createAesGcmKeyMaterial();
  const prepared = await owner.prepare({
    action: 'rekey',
    sourceKey: key,
    targetKey: next.key,
    sourceProfileBinding: profileBinding,
    targetProfileBinding: nextProfileBinding,
  });
  await owner.apply(prepared);
  await expect(
    loadSyncConnectionAuthentication(connection.identity, key, profileBinding)
  ).rejects.toThrow();
  await expect(
    loadSyncConnectionAuthentication(connection.identity, next.key, nextProfileBinding)
  ).resolves.toEqual(authentication);
});
it('replays the exact encrypted target without generating another credential', async () => {
  const f = fixture();
  await activate();
  const { owner, prepared } = await protect();
  const target = structuredClone(f.table().get('credential'));
  await owner.apply(prepared);
  expect(f.table().get('credential')).toEqual(target);
});
it('rejects delayed transition publication after credential replacement', async () => {
  fixture();
  const connection = await activate();
  const owner = createWebdavSecretProtectionParticipant();
  const { key } = await createAesGcmKeyMaterial();
  const prepared = await owner.prepare({
    action: 'protect',
    sourceKey: null,
    targetKey: key,
    sourceProfileBinding: null,
    targetProfileBinding: profileBinding,
  });
  const reservation = await beginSyncConnectionAuthUpdate(selection, connection.identity);
  const replacement = { ...authentication, password: 'replacement-password' };
  const replaced = await commitSyncConnectionAuthentication(reservation, replacement);
  await expect(owner.apply(prepared)).rejects.toThrow();
  await expect(loadSyncConnectionAuthentication(replaced.identity)).resolves.toEqual(replacement);
});
it('rejects a recreated connection even when account and workspace selection match', async () => {
  const f = fixture();
  await activate();
  const { prepared } = await protect();
  const current = await loadSyncConnection();
  expect(current).not.toBeNull();
  if (!current) throw new Error('Missing connection');
  f.table().set('connection', {
    ...current,
    identity: { ...current.identity, incarnation: crypto.randomUUID() },
  });
  await expect(createWebdavSecretProtectionParticipant().apply(prepared)).rejects.toThrow();
});
it(
  'resets protected authentication without a phrase while preserving the selected ' +
    'profile and source rows',
  async () => {
    const f = fixture();
    const connection = await activate();
    const { owner } = await protect();
    const profile = structuredClone(f.rows.get('sync_capture')!.get('profile'));
    const prepared = await owner.prepare({
      action: 'reset',
      sourceKey: null,
      targetKey: null,
      sourceProfileBinding: profileBinding,
      targetProfileBinding: null,
    });
    await owner.apply(prepared);
    await owner.apply(prepared);
    expect(f.table().has('credential')).toBe(false);
    expect(await loadSyncConnection()).toEqual(
      expect.objectContaining({
        phase: 'updating-auth',
        credentialId: null,
        identity: { ...connection.identity, revision: connection.identity.revision + 1 },
      })
    );
    expect(f.rows.get('sync_capture')!.get('profile')).toEqual(profile);
  }
);
it('preserves a user pause when reset requires replacement authentication', async () => {
  fixture();
  const connection = await activate();
  await commandSyncConnection(connection.identity, 'pause');
  const { owner } = await protect();
  const reset = await owner.prepare({
    action: 'reset',
    sourceKey: null,
    targetKey: null,
    sourceProfileBinding: profileBinding,
    targetProfileBinding: null,
  });
  await owner.apply(reset);
  const resetConnection = await loadSyncConnection();
  if (!resetConnection) throw new Error('Missing reset connection');
  const reservation = await beginSyncConnectionAuthUpdate(selection, resetConnection.identity);
  const replacement = await commitSyncConnectionAuthentication(reservation, authentication);
  expect(replacement.phase).toBe('paused');
});
it('rejects cross-domain account and workspace envelope substitution', async () => {
  const f = fixture();
  const connection = await activate();
  const { key } = await protect();
  const raw: unknown = f.table().get('credential');
  if (!isRecord(raw) || !isRecord(raw['envelope']) || !isRecord(raw['envelope']['additionalData']))
    throw new Error('Invalid fixture');
  const original = structuredClone(raw);
  for (const [name, value] of [
    ['provider', 'api'],
    ['accountId', 'bob'],
    ['spaceId', 'foreign-space'],
  ]) {
    if (typeof name !== 'string' || typeof value !== 'string')
      throw new Error('Invalid substitution fixture');
    const substituted = {
      ...original,
      envelope: {
        ...raw['envelope'],
        additionalData: { ...raw['envelope']['additionalData'], [name]: value },
      },
    };
    f.table().set('credential', substituted);
    await expect(
      loadSyncConnectionAuthentication(connection.identity, key, profileBinding)
    ).rejects.toThrow();
  }
});
it('refuses malformed prepared records and a protected target carrying a native key', async () => {
  fixture();
  await activate();
  const { prepared } = await protect();
  const owner = createWebdavSecretProtectionParticipant();
  const tampered: PreparedSecretParticipant = {
    ...prepared,
    nativeKey: (await createAesGcmKeyMaterial()).key,
  };
  await expect(owner.apply(tampered)).rejects.toThrow();
  await expect(owner.apply({ payload: { version: 1, source: {}, target: {} } })).rejects.toThrow();
});

it('keeps credential and protection journal publication in the caller native transaction', async () => {
  const f = fixture();
  const connection = await activate();
  const owner = createWebdavSecretProtectionParticipant();
  const { key } = await createAesGcmKeyMaterial();
  const prepared = await owner.prepare({
    action: 'protect',
    sourceKey: null,
    targetKey: key,
    sourceProfileBinding: null,
    targetProfileBinding: profileBinding,
  });
  const db = await initDB();
  const tx = db.transaction(['sync_capture', 'sync_connection', 'secret_protection'], 'readwrite');
  await owner.apply(prepared, tx);
  await tx.objectStore('secret_protection').put({ key: 'journal-proof', phase: 'applied' });
  expect(f.table().get('credential')).toEqual(expect.objectContaining({ version: 1 }));
  expect(f.rows.get('secret_protection')!.has('journal-proof')).toBe(false);
  await tx.done;
  expect(f.rows.get('secret_protection')!.get('journal-proof')).toEqual({
    key: 'journal-proof',
    phase: 'applied',
  });
  await expect(
    loadSyncConnectionAuthentication(connection.identity, key, profileBinding)
  ).resolves.toEqual(authentication);
});

it('refreshes exact protected participant identity when authentication is replaced', async () => {
  const f = fixture();
  const connection = await activate();
  const { key } = await protect();
  f.rows.get('secret_protection')!.set('control', {
    version: 1,
    key: 'control',
    epoch: 7,
    phase: 'stable',
    participants: {
      ai: true,
      webdav: {
        incarnation: connection.identity.incarnation,
        credentialId: connection.credentialId,
      },
    },
  });
  const reservation = await beginSyncConnectionAuthUpdate(selection, connection.identity);
  await expect(commitSyncConnectionAuthentication(reservation, authentication)).rejects.toThrow();
  const replacement = await commitSyncConnectionAuthentication(
    reservation,
    { ...authentication, password: 'replacement-secret' },
    key,
    profileBinding
  );
  expect(f.rows.get('secret_protection')!.get('control')).toEqual({
    version: 1,
    key: 'control',
    epoch: 7,
    phase: 'stable',
    participants: {
      ai: true,
      webdav: {
        incarnation: replacement.identity.incarnation,
        credentialId: replacement.credentialId,
      },
    },
  });
  await expect(
    loadSyncConnectionAuthentication(replacement.identity, key, profileBinding)
  ).resolves.toEqual({ ...authentication, password: 'replacement-secret' });
});

it('rejects ordinary native writers during an unresolved protection transition', async () => {
  const f = fixture();
  const connection = await activate();
  f.rows.get('secret_protection')!.set('control', {
    version: 1,
    key: 'control',
    epoch: 1,
    phase: 'transitioning',
    participants: { ai: false, webdav: null },
  });
  const before = structuredClone(f.table().get('connection'));
  await expect(beginSyncConnectionAuthUpdate(selection, connection.identity)).rejects.toThrow();
  await expect(commandSyncConnection(connection.identity, 'pause')).rejects.toThrow();
  expect(f.table().get('connection')).toEqual(before);
});

it('uses an active admission permit without reacquiring the writer lock', async () => {
  fixture();
  const request = vi.spyOn(navigator.locks, 'request');
  await SecretProtectionAdmissionPermit.run(async (permit) => {
    const reservation = await beginSyncConnectionAuthUpdate(selection, null, permit);
    await commitSyncConnectionAuthentication(reservation, authentication, null, null, permit);
  });
  expect(
    request.mock.calls.filter(([name]) => name === 'sniptale.secret-protection.writers')
  ).toHaveLength(0);
  expect(
    request.mock.calls.filter(([name]) => name === 'sniptale.sync-connection.admission')
  ).toHaveLength(2);
});

it('rejects an expired admission permit before publishing a native reservation', async () => {
  const f = fixture();
  const expired = await SecretProtectionAdmissionPermit.run(async (permit) => permit);
  await expect(beginSyncConnectionAuthUpdate(selection, null, expired)).rejects.toThrow();
  expect(f.table().has('connection')).toBe(false);
});

async function bindingHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value))
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function legacyBindingFixture() {
  const f = fixture();
  const connection = await activate();
  const created = await createSecretProtectionProfile('synthetic common profile phrase');
  const verifier = created.profile.verifier;
  if (verifier.version !== 1) throw new Error('Expected legacy verifier envelope');
  const legacyProfile = {
    ...created.profile,
    verifier: {
      algorithm: verifier.algorithm,
      iv: verifier.iv,
      ciphertext: verifier.ciphertext,
      version: verifier.version,
    },
  };
  const legacyBinding = await bindingHash(legacyProfile);
  await writeSecretProtectionProfile(created.profile);
  const current = await readSecretProtectionProfile();
  if (!current) throw new Error('Missing Chrome profile');
  expect(Object.keys(current.verifier)).toEqual(['algorithm', 'ciphertext', 'iv', 'version']);
  const canonicalBinding = await secretProtectionProfileBinding(current);
  if (!canonicalBinding) throw new Error('Missing current profile binding');
  expect(canonicalBinding).not.toBe(legacyBinding);
  const owner = createWebdavSecretProtectionParticipant();
  const prepared = await owner.prepare({
    action: 'protect',
    sourceKey: null,
    targetKey: created.key,
    sourceProfileBinding: null,
    targetProfileBinding: legacyBinding,
  });
  await owner.apply(prepared);
  return {
    ...f,
    connection,
    owner,
    key: created.key,
    canonicalBinding,
    legacyBinding,
    legacyProfile,
  };
}

it.each(['read', 'rekey', 'unprotect', 'replace'] as const)(
  'accepts the exact legacy construction-order binding after Chrome roundtrip for %s',
  async (operation) => {
    const f = await legacyBindingFixture();
    if (operation === 'read') {
      await expect(
        loadSyncConnectionAuthentication(f.connection.identity, f.key, f.canonicalBinding)
      ).resolves.toEqual(authentication);
      return;
    }
    if (operation === 'replace') {
      const reservation = await beginSyncConnectionAuthUpdate(selection, f.connection.identity);
      const replaced = await commitSyncConnectionAuthentication(
        reservation,
        { ...authentication, password: 'new protected credential' },
        f.key,
        f.canonicalBinding
      );
      await expect(
        loadSyncConnectionAuthentication(replaced.identity, f.key, f.canonicalBinding)
      ).resolves.toEqual({ ...authentication, password: 'new protected credential' });
      expect(f.table().get('credential')).toEqual(
        expect.objectContaining({
          protection: { mode: 'passphrase', profileBinding: f.canonicalBinding },
        })
      );
      return;
    }
    const next = await createAesGcmKeyMaterial();
    const prepared = await f.owner.prepare({
      action: operation === 'rekey' ? 'rekey' : 'unprotect',
      sourceKey: f.key,
      targetKey: operation === 'rekey' ? next.key : null,
      sourceProfileBinding: f.canonicalBinding,
      targetProfileBinding: operation === 'rekey' ? nextProfileBinding : null,
    });
    await f.owner.apply(prepared);
    await expect(
      loadSyncConnectionAuthentication(
        f.connection.identity,
        operation === 'rekey' ? next.key : null,
        operation === 'rekey' ? nextProfileBinding : null
      )
    ).resolves.toEqual(authentication);
  }
);

it('rejects a legacy binding from a foreign current profile despite possession of the old key', async () => {
  const f = await legacyBindingFixture();
  const foreign = await createSecretProtectionProfile('different synthetic profile phrase');
  await writeSecretProtectionProfile(foreign.profile);
  const foreignBinding = await secretProtectionProfileBinding(await readSecretProtectionProfile());
  if (!foreignBinding) throw new Error('Missing foreign profile');
  await expect(
    loadSyncConnectionAuthentication(f.connection.identity, f.key, foreignBinding)
  ).rejects.toThrow();
  await expect(
    f.owner.prepare({
      action: 'unprotect',
      sourceKey: f.key,
      targetKey: null,
      sourceProfileBinding: foreignBinding,
      targetProfileBinding: null,
    })
  ).rejects.toThrow();
  const reservation = await beginSyncConnectionAuthUpdate(selection, f.connection.identity);
  await expect(
    commitSyncConnectionAuthentication(reservation, authentication, f.key, foreignBinding)
  ).rejects.toThrow();
});

it('rejects an arbitrary verifier order instead of treating every stored binding as compatible', async () => {
  const f = await legacyBindingFixture();
  const verifier = f.legacyProfile.verifier;
  const arbitrary = await bindingHash({
    ...f.legacyProfile,
    verifier: {
      version: verifier.version,
      algorithm: verifier.algorithm,
      ciphertext: verifier.ciphertext,
      iv: verifier.iv,
    },
  });
  expect(arbitrary).not.toBe(f.legacyBinding);
  expect(arbitrary).not.toBe(f.canonicalBinding);
  const raw: unknown = f.table().get('credential');
  if (!isRecord(raw)) throw new Error('Missing credential');
  f.table().set('credential', {
    ...raw,
    protection: { mode: 'passphrase', profileBinding: arbitrary },
  });
  await expect(
    loadSyncConnectionAuthentication(f.connection.identity, f.key, f.canonicalBinding)
  ).rejects.toThrow();
  await expect(
    f.owner.prepare({
      action: 'unprotect',
      sourceKey: f.key,
      targetKey: null,
      sourceProfileBinding: f.canonicalBinding,
      targetProfileBinding: null,
    })
  ).rejects.toThrow();
});

it(
  'rejects a delayed legacy-alias transition after the credential is replaced and ' +
    'permits fresh preparation',
  async () => {
    const f = await legacyBindingFixture();
    const prepared = await f.owner.prepare({
      action: 'unprotect',
      sourceKey: f.key,
      targetKey: null,
      sourceProfileBinding: f.canonicalBinding,
      targetProfileBinding: null,
    });
    const reservation = await beginSyncConnectionAuthUpdate(selection, f.connection.identity);
    const replaced = await commitSyncConnectionAuthentication(
      reservation,
      { ...authentication, password: 'current credential' },
      f.key,
      f.canonicalBinding
    );
    await expect(f.owner.apply(prepared)).rejects.toThrow();
    const fresh = await f.owner.prepare({
      action: 'unprotect',
      sourceKey: f.key,
      targetKey: null,
      sourceProfileBinding: f.canonicalBinding,
      targetProfileBinding: null,
    });
    await f.owner.apply(fresh);
    await expect(loadSyncConnectionAuthentication(replaced.identity)).resolves.toEqual({
      ...authentication,
      password: 'current credential',
    });
  }
);

function holdNextProfileLookup() {
  let release!: () => void;
  let entered!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  io.profileLookup.mockImplementationOnce(async () => {
    entered();
    await wait;
  });
  return { release, started };
}

it('refuses a legacy-alias read after connection recreation during profile lookup', async () => {
  const f = await legacyBindingFixture();
  const gate = holdNextProfileLookup();
  const reading = loadSyncConnectionAuthentication(
    f.connection.identity,
    f.key,
    f.canonicalBinding
  );
  await gate.started;
  let recreated;
  try {
    f.table().delete('connection');
    f.table().delete('credential');
    recreated = await activate();
  } finally {
    gate.release();
  }
  await expect(reading).rejects.toThrow();
  expect(recreated.identity.incarnation).not.toBe(f.connection.identity.incarnation);
  await expect(loadSyncConnectionAuthentication(recreated.identity)).resolves.toEqual(
    authentication
  );
});

it(
  'refuses a parallel legacy-alias writer after reservation replacement during ' +
    'profile lookup and permits fresh retry',
  async () => {
    const f = await legacyBindingFixture();
    const reservation = await beginSyncConnectionAuthUpdate(selection, f.connection.identity);
    const gate = holdNextProfileLookup();
    const delayed = commitSyncConnectionAuthentication(
      reservation,
      { ...authentication, password: 'stale delayed credential' },
      f.key,
      f.canonicalBinding
    );
    await gate.started;
    let replacement;
    try {
      const current = await beginSyncConnectionAuthUpdate(selection, reservation.identity);
      replacement = await commitSyncConnectionAuthentication(
        current,
        { ...authentication, password: 'winning parallel credential' },
        f.key,
        f.canonicalBinding
      );
    } finally {
      gate.release();
    }
    await expect(delayed).rejects.toThrow();
    const afterWinner = structuredClone(f.table());
    await expect(
      commitSyncConnectionAuthentication(reservation, authentication, f.key, f.canonicalBinding)
    ).rejects.toThrow();
    expect(f.table()).toEqual(afterWinner);
    await expect(
      loadSyncConnectionAuthentication(replacement.identity, f.key, f.canonicalBinding)
    ).resolves.toEqual({ ...authentication, password: 'winning parallel credential' });
    const fresh = await beginSyncConnectionAuthUpdate(selection, replacement.identity);
    const retried = await commitSyncConnectionAuthentication(
      fresh,
      authentication,
      f.key,
      f.canonicalBinding
    );
    await expect(
      loadSyncConnectionAuthentication(retried.identity, f.key, f.canonicalBinding)
    ).resolves.toEqual(authentication);
  }
);
