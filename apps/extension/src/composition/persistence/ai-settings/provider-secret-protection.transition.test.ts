import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';

let localState: Record<string, unknown> = {};
let sessionState: Record<string, unknown> = {};

const { localGetMock, localRemoveMock, localSetMock, sessionRemoveMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localRemoveMock: vi.fn(),
  localSetMock: vi.fn(),
  sessionRemoveMock: vi.fn(),
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
      remove: sessionRemoveMock,
      set: vi.fn(),
    },
  },
}));

function pickLocalValues(keys?: string | string[]): Record<string, unknown> {
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
  sessionState = {};
  localGetMock.mockImplementation(async (keys?: string | string[]) => pickLocalValues(keys));
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  sessionRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete sessionState[key];
    }
  });
}

function createTransition(phase: 'pending-disable' | 'pending-enable' | 'pending-reset') {
  return { phase, startedAt: 1, version: 1 };
}

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

async function installTransparentProviderSecret(secret: string) {
  const key = await createAesGcmKeyMaterial();
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: key.material,
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

it('fails disable cleanup without leaving active passphrase metadata beside a transparent key', async () => {
  await installTransparentProviderSecret('provider-secret');
  const { disableStoredAISecretPassphraseProtection, enableStoredAISecretPassphraseProtection } =
    await import('./provider-secret-protection.store.ts');
  const { recoverStoredAISecretPassphraseProtectionTransition } =
    await import('./secret-protection-transition.store.ts');

  await enableStoredAISecretPassphraseProtection('passphrase');
  localRemoveMock.mockRejectedValueOnce(new Error('remove failed'));

  await expect(disableStoredAISecretPassphraseProtection('passphrase')).rejects.toThrow(
    'remove failed'
  );
  expect(localState[AI_SECRET_PROTECTION_KEY]).toBeNull();
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toEqual(expect.any(String));
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toMatchObject({
    phase: 'pending-disable',
  });

  await recoverStoredAISecretPassphraseProtectionTransition();
  expect(localState[AI_SECRET_PROTECTION_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
});

it('recovers pending disable by removing leaked transparent key when protection is still active', async () => {
  const { createAISecretPassphraseProtection } = await import('./secret-protection.store.ts');
  const { recoverStoredAISecretPassphraseProtectionTransition } =
    await import('./secret-protection-transition.store.ts');
  const protection = await createAISecretPassphraseProtection('passphrase');
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: 'leaked-transparent-key',
    [AI_SECRET_PROTECTION_KEY]: protection.protection,
    [AI_SECRET_PROTECTION_TRANSITION_KEY]: createTransition('pending-disable'),
  });

  await recoverStoredAISecretPassphraseProtectionTransition();

  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(protection.protection);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
});

it('recovers pending enable by removing transparent key residue after protection commits', async () => {
  const { createAISecretPassphraseProtection } = await import('./secret-protection.store.ts');
  const { recoverStoredAISecretPassphraseProtectionTransition } =
    await import('./secret-protection-transition.store.ts');
  const protection = await createAISecretPassphraseProtection('passphrase');
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: null,
    [AI_SECRET_PROTECTION_KEY]: protection.protection,
    [AI_SECRET_PROTECTION_TRANSITION_KEY]: createTransition('pending-enable'),
  });

  await recoverStoredAISecretPassphraseProtectionTransition();

  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(protection.protection);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
});

it('recovers pending reset cleanup after provider secrets were durably cleared', async () => {
  const { recoverStoredAISecretPassphraseProtectionTransition } =
    await import('./secret-protection-transition.store.ts');
  installStorageState({
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: null,
    [AI_SECRET_PROTECTION_KEY]: null,
    [AI_SECRET_PROTECTION_TRANSITION_KEY]: createTransition('pending-reset'),
  });

  await recoverStoredAISecretPassphraseProtectionTransition();

  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
});

it('enables passphrase protection without existing secrets through a transition marker', async () => {
  installStorageState({ [AI_PROVIDERS_KEY]: [] });
  const { enableStoredAISecretPassphraseProtection, loadStoredAISecretProtectionStatus } =
    await import('./provider-secret-protection.store.ts');

  await enableStoredAISecretPassphraseProtection('passphrase');

  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_KEY]).toEqual(expect.objectContaining({ version: 1 }));
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
  await expect(loadStoredAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });
});

it('disables passphrase protection from the unlocked in-memory key', async () => {
  await installTransparentProviderSecret('provider-secret');
  const {
    disableStoredAISecretPassphraseProtection,
    enableStoredAISecretPassphraseProtection,
    lockStoredAISecretProtection,
    unlockStoredAISecretProtection,
  } = await import('./provider-secret-protection.store.ts');

  await enableStoredAISecretPassphraseProtection('passphrase');
  await lockStoredAISecretProtection();
  await expect(disableStoredAISecretPassphraseProtection()).rejects.toThrow(
    'AI provider secrets are locked'
  );
  await unlockStoredAISecretProtection('passphrase');
  await disableStoredAISecretPassphraseProtection();

  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toEqual(expect.any(String));
  expect(localState[AI_SECRET_PROTECTION_KEY]).toBeUndefined();
});

it('resets passphrase protection through a recoverable transition marker', async () => {
  const { createAISecretPassphraseProtection } = await import('./secret-protection.store.ts');
  const { resetStoredAISecretPassphraseProtection } =
    await import('./provider-secret-protection.store.ts');
  const protection = await createAISecretPassphraseProtection('passphrase');
  installStorageState({
    [AI_PROVIDERS_KEY]: [createStoredProvider()],
    [AI_PROVIDER_SECRETS_KEY]: { 'provider-1': { version: 2 } },
    [AI_SECRET_PROTECTION_KEY]: protection.protection,
  });
  sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY] = { request: { status: 'pending' } };

  await resetStoredAISecretPassphraseProtection();

  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ hasStoredApiKey: false, id: 'provider-1' }),
  ]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_KEY]).toBeUndefined();
  expect(localState[AI_SECRET_PROTECTION_TRANSITION_KEY]).toBeUndefined();
  expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toBeUndefined();
});
