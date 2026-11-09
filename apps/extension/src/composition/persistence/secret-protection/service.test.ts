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
  prepared: vi.fn<() => unknown>(() => null),
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
  capturePreparedDatabase: io.prepared,
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  io.prepared.mockReturnValue(null);
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
    transaction(stores: string[], mode?: string) {
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
            if (mode !== 'readonly') rows = snapshot;
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
    async readControl() {
      await stop('read-control-before');
      return native.readControl();
    },
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
  function make(
    onUnlocked?: () => Promise<void>,
    profileReader?: typeof readSecretProtectionProfile
  ) {
    return createSecretProtectionService({
      ...(onUnlocked ? { onUnlocked } : {}),
      ...(profileReader ? { readProfile: profileReader } : {}),
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

it('uses one profile when AI precedes WebDAV', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  const profile = await readSecretProtectionProfile();
  await s.enable('webdav');
  expect(await readSecretProtectionProfile()).toEqual(profile);
  await s.lock();
  await expect(f.read(s, 'ai')).rejects.toThrow('locked');
  await s.unlock('phrase');
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});
it('uses one profile when WebDAV precedes AI', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('webdav', 'phrase');
  const profile = await readSecretProtectionProfile();
  await s.enable('ai');
  expect(await readSecretProtectionProfile()).toEqual(profile);
  await s.lock();
  await s.unlock('phrase');
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});
it('preserves AI protection when WebDAV opts out', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  await s.enable('webdav');
  await s.disable('webdav');
  await s.lock();
  await expect(f.read(s, 'ai')).rejects.toThrow('locked');
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
  await s.unlock('phrase');
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
});
it('changes one phrase across every participant', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  await s.enable('webdav');
  await s.changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' });
  await s.lock();
  await expect(s.unlock('phrase')).rejects.toThrow('Invalid');
  await s.unlock('next');
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});
it('keeps a shared profile when its final participant opts out', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  await s.disable('ai');
  expect(await s.readStatus()).toMatchObject({
    isEnabled: true,
    participants: { ai: false, webdav: false },
  });
  await s.lock();
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
  await expect(s.enable('webdav', 'wrong')).rejects.toThrow('Invalid');
});
it('preserves shared WebDAV profile during AI schema reset', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  await s.enable('webdav');
  await s.resetParticipant('ai');
  expect(f.state.has('ai')).toBe(false);
  expect(await s.readStatus()).toMatchObject({ participants: { ai: false, webdav: true } });
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});
it('resets enrolled credentials without removing projects or remote files', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('webdav', 'phrase');
  await s.reset();
  expect(f.state.has('webdav')).toBe(false);
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
  expect(await readSecretProtectionProfile()).toBeNull();
  expect(await s.readStatus()).toMatchObject({ participants: { ai: false, webdav: false } });
});
it('locks a surviving session on worker restart before admitting either participant', async () => {
  const f = await setup();
  let s = f.make();
  await s.enable('ai', 'phrase');
  await s.enable('webdav');
  const epoch = await s.getEpoch();
  s = f.make();
  await s.prepare();
  expect(await s.getEpoch()).toBeGreaterThan(epoch);
  expect(f.contain).toHaveBeenCalled();
  await expect(f.read(s, 'webdav')).rejects.toThrow('locked');
  await s.unlock('phrase');
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});
it('serializes parallel credential writers with protection change', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  const entered = deferred<void>();
  const release = deferred<void>();
  const writer = s.withAdmission('ai', async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  let completed = false;
  const change = s
    .changePassphrase({ currentPassphrase: 'phrase', nextPassphrase: 'next' })
    .then(() => {
      completed = true;
    });
  await Promise.resolve();
  expect(completed).toBe(false);
  release.resolve();
  await writer;
  await change;
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
});
it('rejects an expired writer permit after its admitted operation finishes', async () => {
  const f = await setup();
  const s = f.make();
  await s.prepare();
  const { SecretProtectionAdmissionPermit } = await import('./model');
  let active: unknown;
  await s.withAdmission('ai', async (_key, permit) => {
    active = permit;
    expect(SecretProtectionAdmissionPermit.isActive(active)).toBe(true);
  });
  expect(SecretProtectionAdmissionPermit.isActive(active)).toBe(false);
});
it('refuses stale command retry without changing live credentials', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  const before = structuredClone(f.state.get('ai'));
  await expect(
    s.changePassphrase({ currentPassphrase: 'wrong', nextPassphrase: 'next' })
  ).rejects.toThrow('Invalid');
  expect(f.state.get('ai')).toEqual(before);
  expect(await f.read(s, 'ai')).toBe('ai-password-canary');
});
it('reports lock failure when body containment fails', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('webdav', 'phrase');
  f.contain.mockRejectedValueOnce(new Error('unsafe body'));
  await expect(s.lock()).rejects.toThrow('unsafe body');
  expect((await f.store.readControl()).phase).toBe('transitioning');
  await expect(s.readKey('webdav')).rejects.toThrow('locked');
});
it('removes shared protection with preferences retained', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('webdav', 'phrase');
  const reservation = s.reserveErasure();
  await expect(s.readKey('webdav')).rejects.toThrow('locked');
  await reservation.prepare({ includeAiProviderSecrets: false });
  expect(await readSecretProtectionProfile()).toBeNull();
  reservation.release();
});
it('retains the AI profile when erasure preserves enrolled AI secrets', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  const profile = await readSecretProtectionProfile();
  const reservation = s.reserveErasure();
  await reservation.prepare({ includeAiProviderSecrets: false });
  expect(await readSecretProtectionProfile()).toEqual(profile);
  reservation.release();
});

it('does not publish an unlocked key when final request admission refuses', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('ai', 'phrase');
  await s.lock();
  const admit = vi.fn(async () => false);
  await expect(s.unlock('phrase', admit)).rejects.toThrow('locked');
  expect(admit).toHaveBeenCalledOnce();
  await expect(f.read(s, 'ai')).rejects.toThrow('locked');
});
it('performs unlock recovery after releasing writer exclusion', async () => {
  const f = await setup();
  let selected: ReturnType<typeof f.make> | undefined;
  const resumed = vi.fn(async () => {
    if (!selected) throw new Error('Missing service');
    await selected.withAdmission('webdav', async (key) => {
      expect(key).not.toBeNull();
    });
  });
  const s = f.make(resumed);
  selected = s;
  await s.enable('webdav', 'phrase');
  resumed.mockClear();
  await s.lock();
  await s.unlock('phrase');
  expect(resumed).toHaveBeenCalledOnce();
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});

for (const first of ['ai', 'webdav'] as const) {
  it(`integrates real AI and WebDAV adapters with ${first} protected first`, async () => {
    io.chromeOrder = true;
    const { createAISecretProtectionParticipant } =
      await import('../ai-settings/provider-secret-protection.store');
    const { createAIProviderSecretAdditionalData } =
      await import('../ai-settings/provider-secret-binding');
    const { createWebdavSecretProtectionParticipant } =
      await import('../remote-connection/protection');
    const { syncConnectionSecretAdditionalData, loadSyncConnectionAuthentication } =
      await import('../remote-connection/store');
    const { readSecretProtectionProfileBinding } = await import('./profile.store');
    const db = database();
    io.database.mockResolvedValue(db);
    const provider = {
      id: 'provider-1',
      baseUrl: 'https://api.example.test/v1',
      name: 'Provider',
      connectionType: 'openai-compatible' as const,
      createdAt: 1,
      hasStoredApiKey: true,
    };
    const ai = await createAesGcmKeyMaterial();
    io.state['sniptale_ai_providers'] = [provider];
    io.state['sniptale_ai_provider_secrets'] = {
      'provider-1': await encryptSecret(
        'real-ai-canary',
        ai.key,
        createAIProviderSecretAdditionalData(provider)
      ),
    };
    io.state['sniptale_local_secret_key_material'] = ai.material;
    const metadata = {
      version: 1 as const,
      kind: 'sync-connection' as const,
      key: 'connection' as const,
      binding: {
        provider: 'webdav' as const,
        rootUrl: 'https://dav.example.test/root/',
        accountId: 'alice',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
      identity: { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 },
      phase: 'active' as const,
      updateNonce: null,
      credentialId: '22222222-2222-4222-8222-222222222222',
    };
    const dav = await createAesGcmKeyMaterial();
    const davKey = await importAesGcmKey(dav.material);
    const auth = { kind: 'basic', username: 'alice', password: 'real-webdav-canary' };
    const envelope = await encryptSecret(
      JSON.stringify(auth),
      davKey,
      syncConnectionSecretAdditionalData(metadata, metadata.credentialId)
    );
    const tx = db.transaction(['sync_capture', 'sync_connection']);
    await tx.objectStore('sync_capture').put({
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'space',
      connectionGeneration: 1,
    });
    await tx.objectStore('sync_connection').put(metadata);
    await tx.objectStore('sync_connection').put({
      version: 1,
      kind: 'sync-connection-credential',
      key: 'credential',
      credentialId: metadata.credentialId,
      cryptoKey: davKey,
      envelope,
    });
    await tx.done;
    const service = createSecretProtectionService({
      participants: [
        createAISecretProtectionParticipant(),
        createWebdavSecretProtectionParticipant(),
      ],
      containSync: async () => undefined,
      revokeLeases: () => undefined,
    });
    await service.enable(first, 'one-phrase');
    expect((await service.readStatus()).isUnlocked).toBe(true);
    await service.enable(first === 'ai' ? 'webdav' : 'ai');
    async function readAI() {
      return service.withAdmission('ai', async (key) => {
        const map = io.state['sniptale_ai_provider_secrets'];
        if (!key || !isRecord(map) || !isEncryptedSecretEnvelope(map['provider-1']))
          throw new Error('Missing AI target');
        return decryptSecret(
          map['provider-1'],
          key,
          createAIProviderSecretAdditionalData(provider)
        );
      });
    }
    async function readDAV() {
      return service.withAdmission('webdav', async (key) =>
        loadSyncConnectionAuthentication(
          metadata.identity,
          key,
          key ? await readSecretProtectionProfileBinding() : null
        )
      );
    }
    expect(await readAI()).toBe('real-ai-canary');
    expect(await readDAV()).toEqual(auth);
    const protectedCredential = await db.get('sync_connection', 'credential');
    expect(protectedCredential).not.toHaveProperty('cryptoKey');
    expect(io.state['sniptale_local_secret_key_material']).toBeNull();
    await service.lock();
    await expect(readDAV()).rejects.toThrow('locked');
    await expect(readAI()).rejects.toThrow('locked');
    await service.unlock('one-phrase');
    await service.changePassphrase({
      currentPassphrase: 'one-phrase',
      nextPassphrase: 'next-phrase',
    });
    expect(await readAI()).toBe('real-ai-canary');
    expect(await readDAV()).toEqual(auth);
    await service.disable('webdav');
    await service.lock();
    expect(await readDAV()).toEqual(auth);
    await expect(readAI()).rejects.toThrow('locked');
    await service.unlock('next-phrase');
    expect(await readAI()).toBe('real-ai-canary');
  });
}

it('refuses credential ingress instead of waiting behind exclusive drain', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('webdav', 'phrase');
  const entered = deferred<void>();
  const release = deferred<void>();
  f.contain.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  const locking = s.lock();
  await entered.promise;
  await expect(s.withAdmission('webdav', async () => true)).rejects.toThrow('locked');
  release.resolve();
  await locking;
});
it('refuses credential ingress while startup recovery owns containment', async () => {
  const f = await setup();
  const s = f.make();
  const entered = deferred<void>();
  const release = deferred<void>();
  f.contain.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  const starting = s.prepare();
  await entered.promise;
  await expect(s.readKey('webdav')).rejects.toThrow('locked');
  await expect(s.withAdmission('webdav', async () => true)).rejects.toThrow('locked');
  release.resolve();
  await starting;
});

it('refuses an ordinary writer during exclusive drain instead of deadlocking cleanup', async () => {
  const { withSecretProtectionWriter } = await import('./service');
  const operation = vi.fn(async () => true);
  const request = vi.fn(
    async (
      _name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: null) => Promise<unknown>
    ) => {
      expect(options.ifAvailable).toBe(true);
      return callback(null);
    }
  );
  vi.stubGlobal('navigator', { locks: { request } });
  await expect(withSecretProtectionWriter(operation)).rejects.toThrow('locked');
  expect(operation).not.toHaveBeenCalled();
});

it('attempts request drain when native lock authority cannot be read', async () => {
  const f = await setup();
  const s = f.make();
  await s.enable('webdav', 'phrase');
  const before = f.contain.mock.calls.length;
  f.setFault('read-control-before');
  await expect(s.lock()).rejects.toThrow('Injected read-control-before');
  expect(f.contain.mock.calls.length).toBe(before + 1);
  f.clearFault();
  await expect(s.readKey('webdav')).rejects.toThrow('locked');
});

it('keeps transparent WebDAV eligible when the AI-only session locks', async () => {
  const f = await setup();
  const resume = vi.fn(async () => undefined);
  const s = f.make(resume);
  await s.enable('ai', 'phrase');
  resume.mockClear();
  await s.lock();
  expect(resume).toHaveBeenCalledOnce();
  await expect(f.read(s, 'ai')).rejects.toThrow('locked');
  expect(await f.read(s, 'webdav')).toBe('webdav-password-canary');
});

for (const first of ['ai', 'webdav'] as const) {
  it(`retains one unlocked session when ${first} precedes the other participant through Chrome storage`, async () => {
    io.chromeOrder = true;
    const f = await setup();
    const service = f.make();
    const second = first === 'ai' ? 'webdav' : 'ai';
    await service.enable(first, 'Chrome phrase');
    expect((await service.readStatus()).isUnlocked).toBe(true);
    expect(await f.read(service, first)).toBe(first + '-password-canary');
    await service.enable(second);
    expect((await service.readStatus()).isUnlocked).toBe(true);
    expect(await f.read(service, second)).toBe(second + '-password-canary');
    await service.lock();
    await expect(service.unlock('wrong phrase')).rejects.toThrow('Invalid secret passphrase');
    await service.unlock('Chrome phrase');
    expect(await f.read(service, first)).toBe(first + '-password-canary');
  });
}

it('reads only prepared protection status with real membership and worker profile binding', async () => {
  const f = await setup();
  const s = f.make();
  expect(await s.readPreparedStatus()).toBeNull();
  await s.prepare();
  io.database.mockClear();
  expect(await s.readPreparedStatus()).toBeNull();
  io.prepared.mockReturnValue(f.db);
  expect(await s.readPreparedStatus()).toEqual({
    isEnabled: false,
    isUnlocked: true,
    mode: 'transparent',
    participants: { ai: false, webdav: false },
  });
  await s.enable('webdav', 'prepared phrase');
  io.database.mockClear();
  expect(await s.readPreparedStatus()).toEqual({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
    participants: { ai: false, webdav: true },
  });
  const profile = await readSecretProtectionProfile();
  if (!profile) throw new Error('Missing profile');
  await writeSecretProtectionProfile({ ...profile, updatedAt: profile.updatedAt + 1 });
  expect((await s.readPreparedStatus())?.isUnlocked).toBe(false);
  await writeSecretProtectionProfile(profile);
  expect((await s.readPreparedStatus())?.isUnlocked).toBe(true);
  expect(io.database).not.toHaveBeenCalled();
  await s.lock();
  io.database.mockClear();
  expect((await s.readPreparedStatus())?.isUnlocked).toBe(false);
  s.clearMemory();
  expect(await s.readPreparedStatus()).toBeNull();
  expect(io.database).not.toHaveBeenCalled();
});

it('does not reopen protection storage after a delayed profile read crosses erasure or replacement', async () => {
  const f = await setup();
  const entered = deferred<void>();
  const gate = deferred<void>();
  let delay = false;
  const s = f.make(undefined, async () => {
    if (delay) {
      entered.resolve();
      await gate.promise;
    }
    return readSecretProtectionProfile();
  });
  await s.prepare();
  io.prepared.mockReturnValue(f.db);
  delay = true;
  io.database.mockClear();
  const pending = s.readPreparedStatus();
  await entered.promise;
  io.prepared.mockReturnValue(database());
  gate.resolve();
  expect(await pending).toBeNull();
  expect(io.database).not.toHaveBeenCalled();
  io.prepared.mockReturnValue(f.db);
  vi.spyOn(f.db, 'get').mockRejectedValueOnce(new Error('Closed'));
  expect(await s.readPreparedStatus()).toBeNull();
  const reservation = s.reserveErasure();
  expect(await s.readPreparedStatus()).toBeNull();
  reservation.release();
});

it('reports locked status for a transitioning durable control without preparing or initializing', async () => {
  const f = await setup();
  const s = f.make();
  await s.prepare();
  await s.enable('ai', 'prepared phrase');
  io.prepared.mockReturnValue(f.db);
  const control = await f.store.readControl();
  const tx = f.db.transaction(['secret_protection'], 'readwrite');
  await tx
    .objectStore('secret_protection')
    .put({ ...control, phase: 'transitioning', key: 'control' });
  await tx.done;
  io.database.mockClear();
  expect(await s.readPreparedStatus()).toMatchObject({
    isEnabled: true,
    isUnlocked: false,
    participants: { ai: true, webdav: false },
  });
  expect(io.database).not.toHaveBeenCalled();
});

it('refuses a delayed prepared status after erasure reserves and closes native storage', async () => {
  const f = await setup();
  const entered = deferred<void>();
  const gate = deferred<void>();
  let delay = false;
  const s = f.make(undefined, async () => {
    if (delay) {
      entered.resolve();
      await gate.promise;
    }
    return readSecretProtectionProfile();
  });
  await s.prepare();
  io.prepared.mockReturnValue(f.db);
  delay = true;
  io.database.mockClear();
  const get = vi.spyOn(f.db, 'get');
  const pending = s.readPreparedStatus();
  await entered.promise;
  const reservation = s.reserveErasure();
  io.prepared.mockReturnValue(null);
  gate.resolve();
  expect(await pending).toBeNull();
  expect(get).not.toHaveBeenCalled();
  expect(io.database).not.toHaveBeenCalled();
  reservation.release();
});
