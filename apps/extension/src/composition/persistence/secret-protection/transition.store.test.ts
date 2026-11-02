// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
  decryptSecret,
  importAesGcmKey,
  isEncryptedSecretEnvelope,
  type EncryptedSecretEnvelope,
} from '@sniptale/platform/security/local-secret-crypto';
import { createSecretProtectionService } from './service';
import { createNativeSecretProtectionJournalStore } from './transition.store';
import { readSecretProtectionProfile, writeSecretProtectionProfile } from './profile.store';
import {
  SecretProtectionLockedError,
  type SecretParticipantId,
  type SecretProtectionParticipant,
} from './model';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  state: {} as Record<string, unknown>,
  chromeOrder: false,
}));
function chromeOrdered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(chromeOrdered);
  if (isRecord(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, chromeOrdered(value[key])])
    );
  return value;
}
vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: io.database,
  capturePreparedDatabase: () => null,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await io.database()),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys])
            .filter((k) => Object.hasOwn(io.state, k))
            .map((k) => [k, io.state[k]])
        ),
      set: async (values: Record<string, unknown>) => {
        Object.assign(io.state, io.chromeOrder ? chromeOrdered(values) : structuredClone(values));
      },
      remove: async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete io.state[key];
      },
    },
    session: { remove: async () => undefined, get: async () => ({}), set: async () => undefined },
  },
}));
beforeEach(() => {
  io.state = {};
  io.chromeOrder = false;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, operation: () => Promise<unknown>) =>
        operation(),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function database() {
  let rows = new Map<string, Map<string, unknown>>([
    ['secret_protection', new Map()],
    ['sync_connection', new Map()],
    ['sync_capture', new Map()],
  ]);
  return {
    async get(store: string, key: string) {
      return structuredClone(rows.get(store)?.get(key));
    },
    transaction(stores: string[]) {
      const snapshot = structuredClone(rows);
      let aborted = false;
      return {
        objectStore(name: string) {
          if (!stores.includes(name)) throw new Error('Unselected store');
          const values = snapshot.get(name);
          if (!values) throw new Error('Missing fixture store');
          return {
            get: async (key: string) => structuredClone(values.get(key)),
            put: async (value: unknown) => {
              if (!isRecord(value) || typeof value['key'] !== 'string')
                throw new Error('Missing row key');
              values.set(value['key'], structuredClone(value));
            },
            delete: async (key: string) => {
              values.delete(key);
            },
          };
        },
        abort() {
          aborted = true;
        },
        get done() {
          return Promise.resolve().then(() => {
            if (aborted) throw new Error('Aborted');
            rows = snapshot;
          });
        },
      };
    },
  };
}
interface DomainState {
  envelope: EncryptedSecretEnvelope;
  transparentMaterial: string | null;
  identity: number;
}
async function setup() {
  const db = database();
  io.database.mockResolvedValue(db);
  const state = new Map<SecretParticipantId, DomainState>();
  for (const id of ['ai', 'webdav'] as const) {
    const random = await createAesGcmKeyMaterial();
    state.set(id, {
      envelope: await encryptSecret(id + '-password-canary', random.key, { domain: id }),
      transparentMaterial: random.material,
      identity: 1,
    });
  }
  let fault: string | null = null;
  let failed = false;
  const stop = async (label: string) => {
    if (fault === label && !failed) {
      failed = true;
      throw new Error('Injected ' + label);
    }
  };
  async function digest(value: unknown) {
    return Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
      ),
      (x) => x.toString(16).padStart(2, '0')
    ).join('');
  }
  function participant(id: SecretParticipantId): SecretProtectionParticipant {
    return {
      id,
      binding: async () => ({ incarnation: 'incarnation', credentialId: 'credential' }),
      async prepare(input) {
        const current = state.get(id);
        if (!current) throw new Error('Missing source');
        const source = await digest(current);
        if (input.action === 'reset') return { payload: { source, target: null } };
        const from =
          input.sourceKey ??
          (current.transparentMaterial ? await importAesGcmKey(current.transparentMaterial) : null);
        if (!from) throw new SecretProtectionLockedError();
        const random = input.action === 'unprotect' ? await createAesGcmKeyMaterial() : null;
        const to = random?.key ?? input.targetKey;
        if (!to) throw new Error('Missing target key');
        const plaintext = await decryptSecret(current.envelope, from, { domain: id });
        const target = {
          envelope: await encryptSecret(plaintext, to, { domain: id }),
          transparentMaterial: random?.material ?? null,
          identity: current.identity,
        };
        return { payload: { source, target } };
      },
      async apply(prepared, _tx, targetProfile) {
        await stop('apply-' + id + '-before');
        const payload = prepared.payload;
        if (!isRecord(payload) || typeof payload['source'] !== 'string')
          throw new Error('Invalid prepared target');
        const current = state.get(id);
        const target = payload['target'];
        if (
          JSON.stringify(current) !== JSON.stringify(target) &&
          (await digest(current)) !== payload['source']
        )
          throw new Error('Stale source');
        if (target === null) state.delete(id);
        else {
          if (
            !isRecord(target) ||
            !isEncryptedSecretEnvelope(target['envelope']) ||
            (target['transparentMaterial'] !== null &&
              typeof target['transparentMaterial'] !== 'string') ||
            typeof target['identity'] !== 'number'
          )
            throw new Error('Invalid target');
          state.set(id, {
            envelope: target['envelope'],
            transparentMaterial: target['transparentMaterial'],
            identity: target['identity'],
          });
        }
        if (id === 'ai' && targetProfile !== undefined)
          await writeSecretProtectionProfile(targetProfile);
        await stop('apply-' + id + '-after');
      },
    };
  }
  const native = createNativeSecretProtectionJournalStore();
  const store = {
    ...native,
    async close(...args: Parameters<typeof native.close>) {
      await stop('close-before');
      const result = await native.close(...args);
      await stop('close-after');
      return result;
    },
    async prepare(...args: Parameters<typeof native.prepare>) {
      await stop('prepare-before');
      const result = await native.prepare(...args);
      await stop('prepare-after');
      return result;
    },
    async decide(...args: Parameters<typeof native.decide>) {
      await stop('decide-before');
      const result = await native.decide(...args);
      await stop('decide-after');
      return result;
    },
    async commit(...args: Parameters<typeof native.commit>) {
      await stop('commit-native-before');
      const result = await native.commit(...args);
      await stop('commit-native-after');
      return result;
    },
    async finish(...args: Parameters<typeof native.finish>) {
      await stop('cleanup-before');
      const result = await native.finish(...args);
      await stop('cleanup-after');
      return result;
    },
  };
  const contain = vi.fn(async () => undefined);
  const revoke = vi.fn();
  let writer: Promise<unknown> = Promise.resolve();
  function make() {
    return createSecretProtectionService({
      participants: [participant('ai'), participant('webdav')],
      journal: store,
      containSync: contain,
      revokeLeases: revoke,
      withWriter: async (_mode, operation) => {
        const next = writer.then(operation, operation);
        writer = next.then(
          () => undefined,
          () => undefined
        );
        return next;
      },
    });
  }
  async function read(service: ReturnType<typeof make>, id: SecretParticipantId) {
    return service.withAdmission(id, async (selected) => {
      const current = state.get(id);
      if (!current) return null;
      const resolved =
        selected ??
        (current.transparentMaterial ? await importAesGcmKey(current.transparentMaterial) : null);
      if (!resolved) throw new SecretProtectionLockedError();
      return decryptSecret(current.envelope, resolved, { domain: id });
    });
  }
  return {
    make,
    read,
    state,
    store,
    contain,
    revoke,
    db,
    setFault(label: string) {
      fault = label;
      failed = false;
    },
    clearFault() {
      fault = null;
    },
  };
}

for (const phase of ['close', 'prepare', 'decide', 'replay-ai', 'commit-native', 'cleanup'])
  for (const edge of ['before', 'after']) {
    it(`recovers failure ${edge} ${phase}`, async () => {
      const f = await setup();
      let s = f.make();
      await s.enable('ai', 'phrase');
      await s.enable('webdav');
      const label = phase === 'replay-ai' ? 'apply-ai-' + edge : phase + '-' + edge;
      f.setFault(label);
      await expect(
        s.changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' })
      ).rejects.toThrow('Injected');
      f.clearFault();
      const pending = await f.store.readJournal();
      const committed =
        pending?.phase === 'committing' ||
        pending?.phase === 'applied' ||
        (phase === 'cleanup' && edge === 'after');
      s = f.make();
      await s.prepare();
      expect(await f.store.readJournal()).toBeNull();
      expect((await f.store.readControl()).phase).toBe('stable');
      await expect(f.read(s, 'ai')).rejects.toThrow('locked');
      await s.unlock(committed ? 'next' : 'phrase');
      expect(await f.read(s, 'ai')).toBe('ai-password-canary');
      expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
    });
  }
it('fails closed when prepared target or recovery key is corrupt', async () => {
  const f = await setup();
  let s = f.make();
  await s.enable('ai', 'phrase');
  f.setFault('decide-after');
  await expect(
    s.changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' })
  ).rejects.toThrow();
  f.clearFault();
  const tx = f.db.transaction(['secret_protection']);
  const entry = await tx.objectStore('secret_protection').get('journal');
  if (!isRecord(entry)) throw new Error('Missing journal');
  await tx
    .objectStore('secret_protection')
    .put({ ...entry, envelope: { version: 1, iv: 'invalid', ciphertext: 'invalid' } });
  await tx.done;
  s = f.make();
  await expect(s.prepare()).rejects.toThrow();
  expect((await f.store.readControl()).phase).toBe('transitioning');
});
it('stores only encrypted prepared targets and no derived key material', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  f.setFault('decide-after');
  await expect(
    s.changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' })
  ).rejects.toThrow();
  const entry = await f.store.readJournal();
  expect(entry).not.toBeNull();
  const text = JSON.stringify(entry);
  expect(text).not.toContain('password-canary');
  expect(text).not.toContain('transparentMaterial');
  expect(entry?.recoveryKey.extractable).toBe(false);
  expect(Object.keys(entry ?? {})).toEqual(expect.arrayContaining(['envelope', 'recoveryKey']));
});
it('atomically retires journal with stable control', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  expect(await f.store.readJournal()).toBeNull();
  expect((await f.store.readControl()).phase).toBe('stable');
});
it('resumes a decided command before accepting its retry', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  f.setFault('apply-ai-after');
  await expect(
    s.changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' })
  ).rejects.toThrow();
  f.clearFault();
  await s.prepare();
  await s.unlock('next');
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
  expect(await f.store.readJournal()).toBeNull();
});

it('preserves transparent key when a legacy reset stopped before its commit', async () => {
  const f = await setup();
  io.state['sniptale_local_secret_key_material'] = 'existing-random-transparent-key';
  io.state['sniptale_ai_secret_protection_transition'] = {
    version: 1,
    phase: 'pending-reset',
    startedAt: 1,
  };
  await f.make().prepare();
  expect(io.state['sniptale_local_secret_key_material']).toBe('existing-random-transparent-key');
  expect(io.state['sniptale_ai_secret_protection_transition']).toBeUndefined();
});
it('rejects malformed legacy transition without removing source metadata', async () => {
  const f = await setup();
  io.state['sniptale_local_secret_key_material'] = 'existing-random-transparent-key';
  io.state['sniptale_ai_secret_protection_transition'] = { version: 1, phase: 'unknown' };
  await expect(f.make().prepare()).rejects.toThrow('unavailable');
  expect(io.state['sniptale_local_secret_key_material']).toBe('existing-random-transparent-key');
});

it('refuses a new profile when enrolled participant metadata loses its profile', async () => {
  const f = await setup();
  let s = f.make();
  await s.enable('ai', 'phrase');
  const original = structuredClone(f.state.get('ai'));
  delete io.state['sniptale_ai_secret_protection'];
  s = f.make();
  await expect(s.enable('webdav', 'different')).rejects.toThrow('profile unavailable');
  expect(f.state.get('ai')).toEqual(original);
  expect(await readSecretProtectionProfile()).toBeNull();
});

for (const fault of ['prepare-after', 'decide-after', 'apply-ai-after', 'commit-native-after']) {
  it(`recovers the existing encrypted journal after ${fault} through Chrome profile ordering`, async () => {
    io.chromeOrder = true;
    const f = await setup();
    let service = f.make();
    await service.enable('ai', 'phrase');
    await service.enable('webdav');
    f.setFault(fault);
    await expect(
      service.changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' })
    ).rejects.toThrow();
    f.clearFault();
    service = f.make();
    await service.prepare();
    await service.unlock(fault === 'prepare-after' ? 'phrase' : 'next');
    expect(await f.read(service, 'ai')).toBe('ai-password-canary');
    expect(await f.read(service, 'webdav')).toBe('webdav-password-canary');
  });
}
