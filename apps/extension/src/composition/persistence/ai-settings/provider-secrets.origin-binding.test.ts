import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';
import { createAIProviderSecretAdditionalData } from './provider-secret-binding';
import type { AIProvider } from '../../../contracts/settings';

const { localGetMock, localRemoveMock, localSetMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  localSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: localGetMock,
      remove: localRemoveMock,
      set: localSetMock,
    },
    session: {
      get: vi.fn(async () => ({})),
      remove: vi.fn(),
      set: vi.fn(),
    },
  },
}));

let localState: Record<string, unknown> = {};

function createProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    baseUrl: 'https://provider.example.com/v1',
    connectionType: 'openai-compatible',
    createdAt: 1,
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider',
    ...overrides,
  };
}

function createProviderUpsertInput(overrides: Partial<AIProvider> = {}, apiKey?: string) {
  const provider = createProvider(overrides);
  return {
    id: provider.id,
    name: provider.name,
    connectionType: provider.connectionType,
    baseUrl: provider.baseUrl,
    createdAt: provider.createdAt,
    ...(apiKey === undefined ? {} : { apiKey }),
  };
}

function pickStateValues(keys?: string | string[]): Record<string, unknown> {
  if (!keys) {
    return { ...localState };
  }

  const requestedKeys = Array.isArray(keys) ? keys : [keys];
  return requestedKeys.reduce<Record<string, unknown>>((result, key) => {
    if (key in localState) {
      result[key] = localState[key];
    }
    return result;
  }, {});
}

function installStorageState(state: Record<string, unknown>): void {
  localState = { ...state };
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickStateValues(keys));
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
}

async function installBoundProviderSecret(secret: string, provider = createProvider()) {
  const key = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: key.material,
    [AI_PROVIDERS_KEY]: [provider],
    [AI_PROVIDER_SECRETS_KEY]: {
      [provider.id]: await encryptSecret(
        secret,
        key.key,
        createAIProviderSecretAdditionalData(provider)
      ),
    },
  });
  return key;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
});

it('preserves a stored provider secret on name-only updates', async () => {
  await installBoundProviderSecret('provider-secret');
  const { loadStoredAIProviderSecret, upsertStoredAIProviderRecord } =
    await import('./provider-secrets.store.ts');

  await upsertStoredAIProviderRecord(createProviderUpsertInput({ name: 'Renamed provider' }, ''));

  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ hasStoredApiKey: true, name: 'Renamed provider' }),
  ]);
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('provider-secret');
});

it('preserves unknown stored provider fields on compatible updates', async () => {
  const provider = { ...createProvider(), legacyField: 'keep-me' } as AIProvider;
  await installBoundProviderSecret('provider-secret', provider);
  const { upsertStoredAIProviderRecord } = await import('./provider-secrets.store.ts');

  await upsertStoredAIProviderRecord(createProviderUpsertInput({ name: 'Renamed provider' }, ''));

  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ legacyField: 'keep-me', name: 'Renamed provider' }),
  ]);
});

it('clears the stored provider secret when origin changes without a new key', async () => {
  await installBoundProviderSecret('provider-secret');
  const { loadStoredAIProviderSecret, upsertStoredAIProviderRecord } =
    await import('./provider-secrets.store.ts');

  await upsertStoredAIProviderRecord(
    createProviderUpsertInput({ baseUrl: 'https://other.example.com/v1' }, '')
  );

  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({
      baseUrl: 'https://other.example.com/v1',
      hasStoredApiKey: false,
    }),
  ]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();
});

it('binds a replacement key to the new provider origin', async () => {
  await installBoundProviderSecret('old-secret');
  const { loadStoredAIProviderSecret, upsertStoredAIProviderRecord } =
    await import('./provider-secrets.store.ts');

  await upsertStoredAIProviderRecord(
    createProviderUpsertInput({ baseUrl: 'https://other.example.com/v1' }, 'new-secret')
  );

  const secrets = localState[AI_PROVIDER_SECRETS_KEY] as Record<string, { version: number }>;
  expect(secrets['provider-1']).toEqual(expect.objectContaining({ version: 2 }));
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('new-secret');
});

it('rejects invalid provider origins before building secret binding data', () => {
  expect(() =>
    createAIProviderSecretAdditionalData(createProvider({ baseUrl: 'http://api.example.com/v1' }))
  ).toThrow('Invalid AI provider base URL for secret binding');
});

it('migrates a legacy provider secret after one successful context-bound read', async () => {
  const provider = createProvider();
  const key = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: key.material,
    [AI_PROVIDERS_KEY]: [provider],
    [AI_PROVIDER_SECRETS_KEY]: {
      [provider.id]: await encryptSecret('legacy-secret', key.key),
    },
  });
  const { activateStoredAIProviderSecretForUse } = await import('./provider-secrets.store.ts');

  await expect(activateStoredAIProviderSecretForUse(provider)).resolves.toBe('legacy-secret');

  const secrets = localState[AI_PROVIDER_SECRETS_KEY] as Record<string, { version: number }>;
  expect(secrets[provider.id]).toEqual(expect.objectContaining({ version: 2 }));
});
