// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  PreparedSecretParticipant,
  SecretParticipantPreparation,
} from '../../composition/persistence/secret-protection/model';
import { createBackgroundSecretProtection } from './composition';

const io = vi.hoisted(() => ({
  database: vi.fn(),
  state: {} as Record<string, unknown>,
  events: [] as string[],
  aiPrepare: vi.fn(async (_input: SecretParticipantPreparation) => ({ payload: { owner: 'ai' } })),
  webdavPrepare: vi.fn(async (_input: SecretParticipantPreparation) => ({
    payload: { owner: 'webdav' },
  })),
  aiApply: vi.fn(async (_input: PreparedSecretParticipant) => undefined),
  webdavApply: vi.fn(async (_input: PreparedSecretParticipant) => undefined),
}));
vi.mock('../../composition/persistence/ai-settings/provider-secret-protection.store', () => ({
  createAISecretProtectionParticipant: () => ({
    id: 'ai',
    prepare: io.aiPrepare,
    apply: io.aiApply,
  }),
}));
vi.mock('../../composition/persistence/remote-connection/protection', () => ({
  createWebdavSecretProtectionParticipant: () => ({
    id: 'webdav',
    prepare: io.webdavPrepare,
    apply: io.webdavApply,
  }),
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/core', () => ({
  initDB: io.database,
  capturePreparedDatabase: () => null,
}));
vi.mock('../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation(await io.database()),
}));
vi.mock('../../composition/persistence/secret-protection/secret-unlock-requests.store', () => ({
  clearStoredAISecretUnlockRequests: async () => undefined,
}));
vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys])
            .filter((key) => Object.hasOwn(io.state, key))
            .map((key) => [key, io.state[key]])
        ),
      set: async (values: Record<string, unknown>) => {
        Object.assign(io.state, structuredClone(values));
      },
      remove: async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete io.state[key];
      },
    },
    session: { remove: async () => undefined },
  },
}));
function database() {
  let rows = new Map<string, Map<string, unknown>>([
    ['secret_protection', new Map()],
    ['sync_connection', new Map()],
    ['sync_capture', new Map()],
  ]);
  return {
    get: async (store: string, key: string) => structuredClone(rows.get(store)?.get(key)),
    transaction(stores: string[], mode?: string) {
      const snapshot = structuredClone(rows);
      let aborted = false;
      return {
        objectStore(name: string) {
          if (!stores.includes(name)) throw new Error('Unselected fixture store');
          const values = snapshot.get(name);
          if (!values) throw new Error('Missing fixture store');
          return {
            get: async (key: string) => structuredClone(values.get(key)),
            put: async (value: unknown) => {
              if (!isRecord(value) || typeof value['key'] !== 'string')
                throw new Error('Missing fixture row key');
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
            if (aborted) throw new Error('Fixture transaction aborted');
            if (mode !== 'readonly') rows = snapshot;
          });
        },
      };
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.state = {};
  io.events = [];
  io.database.mockResolvedValue(database());
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, operation: () => Promise<unknown>) =>
        operation(),
    },
  });
  io.aiPrepare.mockImplementation(async () => {
    io.events.push('ai-prepare');
    return { payload: { owner: 'ai' } };
  });
  io.webdavPrepare.mockImplementation(async () => {
    io.events.push('webdav-prepare');
    return { payload: { owner: 'webdav' } };
  });
  io.aiApply.mockImplementation(async () => {
    io.events.push('ai-apply');
  });
  io.webdavApply.mockImplementation(async () => {
    io.events.push('webdav-apply');
  });
});
afterEach(() => vi.unstubAllGlobals());
function lifetime() {
  return {
    containForSecretProtection: vi.fn(async () => {
      io.events.push('contain');
    }),
    revokeCredentialLeases: vi.fn(() => {
      io.events.push('revoke');
    }),
    resumeAfterUnlock: vi.fn(async () => {
      io.events.push('resume');
    }),
  };
}
it('refuses unbound containment and accepts only one live sync owner before recovering preparation', async () => {
  const owner = createBackgroundSecretProtection();
  await expect(owner.service.prepare()).rejects.toThrow('sync containment unavailable');
  expect(io.aiApply).not.toHaveBeenCalled();
  expect(io.webdavApply).not.toHaveBeenCalled();
  const sync = lifetime();
  owner.bindSync(sync);
  expect(() => owner.bindSync(lifetime())).toThrow('already bound');
  await owner.service.prepare();
  expect(sync.containForSecretProtection).toHaveBeenCalled();
  expect(await owner.service.readStatus()).toMatchObject({
    isEnabled: false,
    participants: { ai: false, webdav: false },
  });
});
it(
  'uses both actual composition participant ports through the real service and encrypted ' +
    'journal after sync containment',
  async () => {
    const owner = createBackgroundSecretProtection();
    const sync = lifetime();
    owner.bindSync(sync);
    await owner.service.prepare();
    io.events = [];
    await owner.service.resetParticipant('ai');
    expect(io.aiPrepare).toHaveBeenCalledWith(expect.objectContaining({ action: 'reset' }));
    expect(io.aiApply).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { owner: 'ai' } }),
      undefined,
      null
    );
    expect(io.events.indexOf('revoke')).toBeLessThan(io.events.indexOf('contain'));
    expect(io.events.indexOf('contain')).toBeLessThan(io.events.indexOf('ai-prepare'));
    expect(io.events.indexOf('ai-prepare')).toBeLessThan(io.events.indexOf('ai-apply'));
    await owner.service.resetParticipant('webdav');
    expect(io.webdavPrepare).toHaveBeenCalledWith(expect.objectContaining({ action: 'reset' }));
    expect(io.webdavApply).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { owner: 'webdav' } }),
      expect.objectContaining({ objectStore: expect.any(Function) })
    );
    expect(sync.resumeAfterUnlock).toHaveBeenCalled();
    const admission = vi.fn();
    const reservation = owner.service.reserveErasure();
    await expect(owner.service.withAdmission('webdav', admission)).rejects.toThrow(
      'Secrets are locked'
    );
    expect(admission).not.toHaveBeenCalled();
    reservation.release();
  }
);
it(
  'propagates containment failure before participant mutation and permits retry with the ' +
    'same bound lifetime',
  async () => {
    const owner = createBackgroundSecretProtection();
    const sync = lifetime();
    owner.bindSync(sync);
    await owner.service.prepare();
    sync.containForSecretProtection.mockRejectedValueOnce(
      new Error('Controlled containment failure')
    );
    await expect(owner.service.resetParticipant('ai')).rejects.toThrow(
      'Controlled containment failure'
    );
    expect(io.aiPrepare).not.toHaveBeenCalled();
    expect(io.aiApply).not.toHaveBeenCalled();
    await owner.service.resetParticipant('ai');
    expect(io.aiApply).toHaveBeenCalledOnce();
  }
);
