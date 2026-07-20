import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';

const {
  localGetMock,
  localRemoveMock,
  localSetMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  sessionGetMock,
  sessionRemoveMock,
  sessionSetMock,
} = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  localSetMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
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

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
    info: loggerInfoMock,
    warn: loggerWarnMock,
  }),
}));

let localState: Record<string, unknown> = {};
let sessionState: Record<string, unknown> = {};

function createStoredProvider(id = 'provider-1') {
  return {
    id,
    name: `Provider ${id}`,
    connectionType: 'openai-compatible' as const,
    baseUrl: `https://${id}.example.com`,
    hasStoredApiKey: true,
    createdAt: 1,
  };
}

function pickStateValues(keys?: string | string[]) {
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

function installStorageState(local: Record<string, unknown>) {
  localState = { ...local };
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickStateValues(keys));
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  sessionState = {};
  sessionGetMock.mockImplementation(async (keys?: string | string[]) => {
    if (!keys) {
      return { ...sessionState };
    }

    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    return requestedKeys.reduce<Record<string, unknown>>((result, key) => {
      if (key in sessionState) {
        result[key] = sessionState[key];
      }
      return result;
    }, {});
  });
  sessionSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(sessionState, payload);
  });
  sessionRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete sessionState[key];
    }
  });
}

function expectPassphraseProtectionMetadata() {
  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(
    expect.objectContaining({ mode: 'passphrase', version: 1 })
  );
}

function expectNoSessionPassphraseKeyMaterial() {
  expect(sessionSetMock).not.toHaveBeenCalled();
  expect(sessionState[AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY]).toBeUndefined();
}

async function expectPassphraseProtectionStatus(
  loadStatus: () => Promise<unknown>,
  isUnlocked: boolean
) {
  await expect(loadStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked,
    mode: 'passphrase',
  });
}

async function installTransparentProviderSecret(secret: string) {
  const transparentKey = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': await encryptSecret(secret, transparentKey.key),
    },
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: transparentKey.material,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
});

it('fails closed when encrypted secrets exist without stored key material', async () => {
  const created = await createAesGcmKeyMaterial();
  const storedSecret = await encryptSecret('provider-1-secret', created.key);

  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': storedSecret,
    },
  });

  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store.ts');

  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Encrypted AI provider secret is missing key material',
    { providerId: 'provider-1' }
  );
});

it('fails closed when the stored secret key material cannot be imported', async () => {
  const created = await createAesGcmKeyMaterial();
  const storedSecret = await encryptSecret('provider-1-secret', created.key);

  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-1': storedSecret,
    },
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: 'invalid-key-material',
  });

  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store.ts');

  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to decrypt AI provider secret',
    expect.objectContaining({
      error: expect.any(Error),
      providerId: 'provider-1',
    })
  );
});

it('does not reconstruct provider secrets from metadata and key material without an envelope', async () => {
  const created = await createAesGcmKeyMaterial();

  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: created.material,
  });

  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store.ts');

  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();
  expect(loggerWarnMock).not.toHaveBeenCalled();
  expect(loggerErrorMock).not.toHaveBeenCalled();
});

it('keeps passphrase-protected key material out of session storage', async () => {
  await installTransparentProviderSecret('provider-1-secret');
  sessionState[AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY] = 'legacy-session-key-material';

  const {
    enableStoredAISecretPassphraseProtection,
    lockStoredAISecretProtection,
    loadStoredAISecretProtectionStatus,
    unlockStoredAISecretProtection,
  } = await import('./provider-secret-protection.store.ts');
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store.ts');

  await enableStoredAISecretPassphraseProtection('correct horse battery staple');

  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expectPassphraseProtectionMetadata();
  expectNoSessionPassphraseKeyMaterial();
  await expectPassphraseProtectionStatus(loadStoredAISecretProtectionStatus, true);
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');

  sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY] = { request: { status: 'pending' } };
  await lockStoredAISecretProtection();
  expect(sessionState[AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY]).toBeUndefined();
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBeNull();
  expectPassphraseProtectionMetadata();
  await expectPassphraseProtectionStatus(loadStoredAISecretProtectionStatus, false);
  await expect(unlockStoredAISecretProtection('wrong passphrase')).rejects.toThrow();
  expectPassphraseProtectionMetadata();
  await unlockStoredAISecretProtection('correct horse battery staple');
  expectNoSessionPassphraseKeyMaterial();
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');
});

it('rotates passphrase-protected secrets without storing key material in session storage', async () => {
  await installTransparentProviderSecret('provider-1-secret');

  const {
    changeStoredAISecretPassphraseProtection,
    enableStoredAISecretPassphraseProtection,
    lockStoredAISecretProtection,
    unlockStoredAISecretProtection,
  } = await import('./provider-secret-protection.store.ts');
  const { loadStoredAIProviderSecret } = await import('./provider-secrets.store.ts');

  await enableStoredAISecretPassphraseProtection('old passphrase');
  sessionState[AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY] = 'legacy-session-key-material';
  await changeStoredAISecretPassphraseProtection({
    currentPassphrase: 'old passphrase',
    nextPassphrase: 'new passphrase',
  });

  expectNoSessionPassphraseKeyMaterial();
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');
  await lockStoredAISecretProtection();
  await expect(unlockStoredAISecretProtection('old passphrase')).rejects.toThrow();
  await unlockStoredAISecretProtection('new passphrase');
  await expect(loadStoredAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');
});
