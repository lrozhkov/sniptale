import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';

const {
  localGetMock,
  localRemoveMock,
  localSetMock,
  sessionGetMock,
  sessionRemoveMock,
  sessionSetMock,
} = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  localSetMock: vi.fn(),
  sessionGetMock: vi.fn(),
  sessionRemoveMock: vi.fn(),
  sessionSetMock: vi.fn(),
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
      get: sessionGetMock,
      remove: sessionRemoveMock,
      set: sessionSetMock,
    },
  },
}));

let localState: Record<string, unknown> = {};
let sessionState: Record<string, unknown> = {};

function createStoredProvider() {
  return {
    baseUrl: 'https://provider.example.com',
    connectionType: 'openai-compatible' as const,
    createdAt: 1,
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider',
  };
}

function pickValues(state: Record<string, unknown>, keys?: string | string[]) {
  if (!keys) {
    return { ...state };
  }

  const requestedKeys = Array.isArray(keys) ? keys : [keys];
  return requestedKeys.reduce<Record<string, unknown>>((result, key) => {
    if (key in state) {
      result[key] = state[key];
    }
    return result;
  }, {});
}

function installStorageState(local: Record<string, unknown>) {
  localState = { ...local };
  sessionState = {};
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickValues(localState, keys));
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  sessionGetMock.mockImplementation(async (keys?: string | string[]) =>
    pickValues(sessionState, keys)
  );
  sessionSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(sessionState, payload);
  });
  sessionRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete sessionState[key];
    }
  });
}

async function installTransparentProviderSecret(secret: string) {
  const transparentKey = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: transparentKey.material,
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret(secret, transparentKey.key),
    },
  });
}

function expectNoPersistedPassphraseKeyMaterial() {
  const protection = localState[AI_SECRET_PROTECTION_KEY];

  expect(sessionSetMock).not.toHaveBeenCalled();
  expect(sessionState[AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(Object.keys(localState).sort()).toEqual(
    [AI_PROVIDERS_KEY, AI_PROVIDER_SECRETS_KEY, AI_SECRET_PROTECTION_KEY].sort()
  );
  expect(protection).toEqual({
    enabledAt: expect.any(Number),
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: expect.any(Number),
      keyLengthBits: 256,
      salt: expect.any(String),
    },
    mode: 'passphrase',
    updatedAt: expect.any(Number),
    verifier: {
      algorithm: 'AES-GCM',
      ciphertext: expect.any(String),
      iv: expect.any(String),
      version: 1,
    },
    version: 1,
  });
  expect(JSON.stringify(protection)).not.toContain('correct horse battery staple');
  expect(JSON.stringify(protection)).not.toContain('keyMaterial');
  expect(JSON.stringify(protection)).not.toContain('derived');
  expect(JSON.stringify(protection)).not.toContain('rawKey');
  expect(JSON.stringify(protection)).not.toContain('"key"');
  expect(JSON.stringify(protection)).not.toContain('"material"');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
});

it('locks passphrase-protected provider secrets after service-worker module restart', async () => {
  await installTransparentProviderSecret('provider-secret');

  const { enableStoredAISecretPassphraseProtection, loadStoredAISecretProtectionStatus } =
    await import('./provider-secret-protection.store.ts');
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store.ts');

  await enableStoredAISecretPassphraseProtection('correct horse battery staple');
  expectNoPersistedPassphraseKeyMaterial();
  await expect(loadStoredAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('provider-secret');

  vi.resetModules();
  const restartedProtection = await import('./provider-secret-protection.store.ts');
  const restartedSecrets = await import('./provider-secrets.store.ts');

  await expect(restartedProtection.loadStoredAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
  });
  await expect(restartedSecrets.readStoredAIProviderSecretState('provider-1')).resolves.toEqual({
    status: 'locked',
  });
  await expect(restartedSecrets.loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();

  await restartedProtection.unlockStoredAISecretProtection('correct horse battery staple');
  expectNoPersistedPassphraseKeyMaterial();
  await expect(restartedSecrets.loadStoredAIProviderSecret('provider-1')).resolves.toBe(
    'provider-secret'
  );
});

it('rejects downgraded passphrase metadata before deriving a key', async () => {
  installStorageState({
    [AI_SECRET_PROTECTION_KEY]: {
      enabledAt: 1,
      kdf: {
        algorithm: 'PBKDF2',
        hash: 'SHA-256',
        iterations: 1,
        keyLengthBits: 256,
        salt: btoa('1234567890123456'),
      },
      mode: 'passphrase',
      updatedAt: 2,
      verifier: {
        algorithm: 'AES-GCM',
        ciphertext: 'ciphertext',
        iv: 'initial-vector',
        version: 1,
      },
      version: 1,
    },
  });
  const deriveBitsSpy = vi.spyOn(crypto.subtle, 'deriveBits');

  const { readStoredAISecretProtection, unlockStoredAISecretPassphrase } =
    await import('./secret-protection.store.ts');

  await expect(readStoredAISecretProtection()).resolves.toBeNull();
  await expect(unlockStoredAISecretPassphrase('passphrase')).resolves.toBeUndefined();
  expect(deriveBitsSpy).not.toHaveBeenCalled();
});

it('rejects hostile passphrase salt and iteration metadata before deriving a key', async () => {
  const { createAISecretPassphraseProtection, readStoredAISecretProtection } =
    await import('./secret-protection.store.ts');
  const validProtection = await createAISecretPassphraseProtection('passphrase');

  for (const kdf of [
    { ...validProtection.protection.kdf, iterations: 10_000_000 },
    { ...validProtection.protection.kdf, salt: 'not base64 !' },
    { ...validProtection.protection.kdf, salt: btoa('short') },
    { ...validProtection.protection.kdf, salt: btoa('12345678901234567') },
  ]) {
    installStorageState({
      [AI_SECRET_PROTECTION_KEY]: {
        ...validProtection.protection,
        kdf,
      },
    });

    await expect(readStoredAISecretProtection()).resolves.toBeNull();
  }
});
