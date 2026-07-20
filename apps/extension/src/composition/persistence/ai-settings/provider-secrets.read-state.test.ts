import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';

let localState: Record<string, unknown> = {};

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

function installStorageState(state: Record<string, unknown>) {
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

function createStoredProvider() {
  return {
    baseUrl: 'https://provider.example.com/v1',
    connectionType: 'openai-compatible' as const,
    createdAt: 1,
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider',
  };
}

async function installTransparentSecret(secret: string, keyMaterial?: string) {
  const key = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: keyMaterial ?? key.material,
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret(secret, key.key),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
});

it('returns ok when a provider secret can be decrypted', async () => {
  await installTransparentSecret('provider-secret');
  const { readStoredAIProviderSecretState } = await import('./provider-secrets.store.ts');

  await expect(readStoredAIProviderSecretState('provider-1')).resolves.toEqual({
    secret: 'provider-secret',
    status: 'ok',
  });
});

it('returns missing when no encrypted provider envelope exists', async () => {
  const { readStoredAIProviderSecretState } = await import('./provider-secrets.store.ts');

  await expect(readStoredAIProviderSecretState('provider-1')).resolves.toEqual({
    status: 'missing',
  });
});

it('returns key-missing when encrypted secrets have no transparent key', async () => {
  const key = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret('provider-secret', key.key),
    },
  });
  const { readStoredAIProviderSecretState } = await import('./provider-secrets.store.ts');

  await expect(readStoredAIProviderSecretState('provider-1')).resolves.toEqual({
    status: 'key-missing',
  });
});

it('returns locked when passphrase-protected secrets are not unlocked', async () => {
  const { createAISecretPassphraseProtection } = await import('./secret-protection.store.ts');
  const protection = await createAISecretPassphraseProtection('passphrase');
  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret('provider-secret', protection.key),
    },
    [AI_SECRET_PROTECTION_KEY]: protection.protection,
  });
  const { readStoredAIProviderSecretState } = await import('./provider-secrets.store.ts');

  await expect(readStoredAIProviderSecretState('provider-1')).resolves.toEqual({
    status: 'locked',
  });
});

it('returns corrupt when transparent key material cannot be imported', async () => {
  await installTransparentSecret('provider-secret', 'not-a-valid-key');
  const { readStoredAIProviderSecretState } = await import('./provider-secrets.store.ts');

  await expect(readStoredAIProviderSecretState('provider-1')).resolves.toMatchObject({
    error: expect.any(Error),
    status: 'corrupt',
  });
});

it('returns corrupt when encrypted provider secrets were written with a different key', async () => {
  const secretKey = await createAesGcmKeyMaterial();
  const storedKey = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: storedKey.material,
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret('provider-secret', secretKey.key),
    },
  });
  const { readStoredAIProviderSecretState } = await import('./provider-secrets.store.ts');

  await expect(readStoredAIProviderSecretState('provider-1')).resolves.toMatchObject({
    error: expect.any(Error),
    status: 'corrupt',
  });
});
