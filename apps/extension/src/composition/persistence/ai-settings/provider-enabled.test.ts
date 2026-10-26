import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../../../contracts/settings';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { mutateStoredAISettings, resetAISettingsMutationQueueForTests } from './graph-mutations';
import { loadAIProviderSecret } from './core';
import { prepareAIProviderTransferMutation } from './provider-secrets.store';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';
import { createAIProviderSecretAdditionalData } from './provider-secret-binding';

const storage = vi.hoisted(() => {
  const state: Record<'local' | 'sync' | 'session', Record<string, unknown>> = {
    local: {},
    sync: {},
    session: {},
  };
  const makeArea = (area: keyof typeof state) => ({
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(state[area], key))
          .map((key) => [key, state[area][key]])
      )
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(state[area], items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[area][key];
    }),
  });
  return { state, local: makeArea('local'), sync: makeArea('sync'), session: makeArea('session') };
});
vi.mock('../infrastructure/browser-storage', async (original) => ({
  ...(await original()),
  browserStorage: storage,
}));

const provider: AIProvider = {
  id: 'provider',
  name: 'Provider',
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  hasStoredApiKey: true,
  createdAt: 1,
  enabled: true,
  management: 'automatic',
  incarnation: 'incarnation',
  revision: 1,
  credentialRevision: 1,
};
function toggle(enabled: boolean) {
  return mutateStoredAISettings({
    operation: 'set-provider-enabled',
    providerId: provider.id,
    providerIncarnation: provider.incarnation!,
    enabled,
  });
}
function current(): AIProvider {
  return (storage.state.local[AI_PROVIDERS_KEY] as AIProvider[])[0]!;
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function expectNoWrites() {
  for (const area of [storage.local, storage.sync, storage.session]) {
    expect(area.set).not.toHaveBeenCalled();
    expect(area.remove).not.toHaveBeenCalled();
  }
}
beforeEach(async () => {
  vi.clearAllMocks();
  for (const area of ['local', 'sync', 'session'] as const) {
    storage[area].set.mockReset();
    storage[area].set.mockImplementation(async (items) => {
      Object.assign(storage.state[area], items);
    });
  }
  resetAISettingsMutationQueueForTests();
  const key = await createAesGcmKeyMaterial();
  storage.state.local = {
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    [AI_PROVIDERS_KEY]: [{ ...provider }],
    [AI_MODELS_KEY]: [],
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: key.material,
    [AI_PROVIDER_SECRETS_KEY]: {
      [provider.id]: await encryptSecret(
        'original-fixture-secret',
        key.key,
        createAIProviderSecretAdditionalData(provider)
      ),
    },
  };
  storage.state.sync = {};
  storage.state.session = {};
});

describe('serialized provider enabled commands', () => {
  it('preserves newer provider configuration and its bound secret after a stale toggle', async () => {
    const entered = gate();
    const release = gate();
    storage.local.set.mockImplementationOnce(async (items) => {
      entered.resolve();
      await release.promise;
      Object.assign(storage.state.local, items);
    });
    const update = mutateStoredAISettings({
      operation: 'update-provider',
      provider: {
        ...provider,
        name: 'New name',
        connectionType: 'openai-compatible',
        baseUrl: 'https://new-provider.test/v2',
        management: 'manual',
        apiKey: 'new-fixture-secret',
      },
    });
    await entered.promise;
    const staleToggle = toggle(false);
    release.resolve();
    await update;
    const updated = { ...current() };
    const secrets = structuredClone(storage.state.local[AI_PROVIDER_SECRETS_KEY]);
    const key = storage.state.local[AI_LOCAL_SECRET_KEY_STORAGE_KEY];
    await staleToggle;
    expect(current()).toEqual({ ...updated, enabled: false, revision: updated.revision! + 1 });
    expect(storage.state.local[AI_PROVIDER_SECRETS_KEY]).toEqual(secrets);
    expect(storage.state.local[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe(key);
    expect(await loadAIProviderSecret(provider.id)).toBe('new-fixture-secret');
  });

  it('refuses a delayed toggle after deletion and same-ID recreation without writes', async () => {
    await mutateStoredAISettings({ operation: 'delete-provider', providerId: provider.id });
    await mutateStoredAISettings({
      operation: 'add-provider',
      provider: { ...provider, apiKey: 'replacement-fixture-secret' },
    });
    expect(current().incarnation).not.toBe(provider.incarnation);
    const replacement = structuredClone(storage.state);
    vi.clearAllMocks();
    await expect(toggle(false)).rejects.toThrow('AI provider unavailable');
    expectNoWrites();
    expect(storage.state).toEqual(replacement);
    expect(await loadAIProviderSecret(provider.id)).toBe('replacement-fixture-secret');
  });

  it('preserves provider and secret after a failed write and supports explicit and idempotent retry', async () => {
    const before = structuredClone(storage.state);
    storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
    await expect(toggle(false)).rejects.toThrow('Storage refused');
    expect(storage.state).toEqual(before);
    expect(await loadAIProviderSecret(provider.id)).toBe('original-fixture-secret');
    await toggle(false);
    expect(current()).toEqual({ ...provider, enabled: false, revision: 2 });
    const committed = structuredClone(storage.state);
    vi.clearAllMocks();
    await toggle(false);
    expectNoWrites();
    expect(storage.state).toEqual(committed);
    expect(await loadAIProviderSecret(provider.id)).toBe('original-fixture-secret');
  });

  it('commits opposite queued toggles in admission order', async () => {
    const entered = gate();
    const release = gate();
    storage.local.set.mockImplementationOnce(async (items) => {
      entered.resolve();
      await release.promise;
      Object.assign(storage.state.local, items);
    });
    const disable = toggle(false);
    await entered.promise;
    const enable = toggle(true);
    release.resolve();
    await Promise.all([disable, enable]);
    expect(
      storage.local.set.mock.calls.map(
        ([items]) => (items[AI_PROVIDERS_KEY] as AIProvider[])[0]?.enabled
      )
    ).toEqual([false, true]);
    expect(current()).toEqual({ ...provider, enabled: true, revision: 3 });
    expect(await loadAIProviderSecret(provider.id)).toBe('original-fixture-secret');
  });

  it.each(['missing', 'missing-incarnation', 'old-schema', 'erased', 'reset'] as const)(
    'refuses %s provider state before any write',
    async (state) => {
      if (state === 'missing') storage.state.local[AI_PROVIDERS_KEY] = [];
      if (state === 'missing-incarnation') {
        const { incarnation: _incarnation, ...legacy } = provider;
        storage.state.local[AI_PROVIDERS_KEY] = [legacy];
      }
      if (state === 'old-schema') storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
      if (state === 'erased') storage.state.local = {};
      if (state === 'reset')
        storage.state.local[AI_STORAGE_RESET_PHASE_KEY] = 'reset-ai-settings-v4';
      const before = structuredClone(storage.state);
      const { setStoredAIProviderEnabled } = await import('./provider-secrets.store');
      await expect(
        runWithExclusivePersistenceMutationPermit((permit) =>
          setStoredAIProviderEnabled(
            {
              providerId: provider.id,
              providerIncarnation: provider.incarnation!,
              enabled: false,
            },
            permit
          )
        )
      ).rejects.toThrow('AI provider unavailable');
      expectNoWrites();
      expect(storage.state).toEqual(before);
    }
  );

  it('refuses an old incarnation after metadata restore without writes', async () => {
    await runWithExclusivePersistenceMutationPermit(async (permit) => {
      const restore = await prepareAIProviderTransferMutation({
        importedProviders: [{ ...provider, incarnation: 'restored-incarnation' }],
        permit,
      });
      await restore.commit();
    });
    expect(current().incarnation).not.toBe(provider.incarnation);
    const restored = structuredClone(storage.state);
    vi.clearAllMocks();
    await expect(toggle(false)).rejects.toThrow('AI provider unavailable');
    expectNoWrites();
    expect(storage.state).toEqual(restored);
  });
});
