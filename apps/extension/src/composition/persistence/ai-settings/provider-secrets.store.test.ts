import { beforeEach, expect, it, vi } from 'vitest';
import { selectSettingsTransferProviderMetadata } from '../../../contracts/settings-transfer/provider-metadata';
import { createAIProviderSecretAdditionalData } from './provider-secret-binding';
import { parseStoredAIProviders } from './guards';

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
    incarnation: `local-${id}`,
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

it('owns transfer binding cleanup and restores encrypted state during compensation', async () => {
  await installTransparentProviderSecret('provider-1-secret');
  const before = structuredClone(localState);
  const { prepareAIProviderTransferMutation } = await import('./provider-secrets.store.ts');
  const plan = await prepareAIProviderTransferMutation({
    importedProviders: [
      {
        ...createStoredProvider('provider-1'),
        baseUrl: 'https://changed.example.com',
        hasStoredApiKey: false,
      },
    ],
  });

  expect(plan.clearedProviderIds).toEqual(['provider-1']);
  expect(plan.missingProviderIds).toEqual(['provider-1']);
  await plan.commit();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ id: 'provider-1', hasStoredApiKey: false }),
  ]);

  await plan.rollback();
  expect(localState).toEqual(before);
});

it('preserves a stored secret when the imported URL keeps the canonical provider origin', async () => {
  await installTransparentProviderSecret('provider-1-secret');
  const beforeSecret = structuredClone(localState[AI_PROVIDER_SECRETS_KEY]);
  const beforeKey = localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY];
  const { prepareAIProviderTransferMutation } = await import('./provider-secrets.store.ts');
  const plan = await prepareAIProviderTransferMutation({
    importedProviders: [
      {
        ...createStoredProvider('provider-1'),
        baseUrl: 'https://provider-1.example.com/v2',
        hasStoredApiKey: false,
      },
    ],
  });

  expect(plan.clearedProviderIds).toEqual([]);
  expect(plan.missingProviderIds).toEqual([]);
  await plan.commit();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual(beforeSecret);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe(beforeKey);
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ id: 'provider-1', hasStoredApiKey: true }),
  ]);
});

it('clears and can restore a stored secret when the connection type changes', async () => {
  await installTransparentProviderSecret('provider-1-secret');
  const before = structuredClone(localState);
  const { prepareAIProviderTransferMutation } = await import('./provider-secrets.store.ts');
  const plan = await prepareAIProviderTransferMutation({
    importedProviders: [
      {
        ...createStoredProvider('provider-1'),
        connectionType: 'chrome-built-in',
        hasStoredApiKey: false,
      },
    ],
  });

  expect(plan.clearedProviderIds).toEqual(['provider-1']);
  expect(plan.missingProviderIds).toEqual(['provider-1']);
  await plan.commit();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  await plan.rollback();
  expect(localState).toEqual(before);
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

it('preserves a modern local secret binding across portable metadata restore', async () => {
  const { provider, envelope } = await installModernProviderSecret();
  const { prepareAIProviderTransferMutation, loadStoredAIProviderSecret } =
    await import('./provider-secrets.store.ts');
  const plan = await prepareAIProviderTransferMutation({
    importedProviders: [
      { ...selectSettingsTransferProviderMetadata(provider), hasStoredApiKey: false },
    ],
  });
  expect(plan.clearedProviderIds).toEqual([]);
  expect(plan.missingProviderIds).toEqual([]);
  await plan.commit();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({ [provider.id]: envelope });
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({
      incarnation: 'local-incarnation',
      revision: 8,
      credentialRevision: 3,
      observation: expect.objectContaining({ status: 'unverified', revision: 8 }),
    }),
  ]);
  const restored = JSON.stringify(localState[AI_PROVIDERS_KEY]);
  expect(restored).not.toContain('old-flight');
  expect(restored).not.toContain('catalogUpdatedAt');
  await expect(loadStoredAIProviderSecret(provider.id)).resolves.toBe('modern-test-secret');
});

it('generates a new local incarnation without trusting imported lifecycle', async () => {
  const imported = {
    ...createStoredProvider(),
    hasStoredApiKey: true,
    incarnation: 'foreign-incarnation',
    revision: 99,
    credentialRevision: 99,
    refreshGeneration: 'foreign-flight',
    catalogUpdatedAt: 123,
    observation: {
      status: 'available' as const,
      scope: 'catalog' as const,
      checkedAt: 123,
      revision: 99,
    },
  };
  const { prepareAIProviderTransferMutation } = await import('./provider-secrets.store.ts');
  const plan = await prepareAIProviderTransferMutation({ importedProviders: [imported] });
  await plan.commit();
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({
      incarnation: expect.any(String),
      revision: 1,
      credentialRevision: 0,
      hasStoredApiKey: false,
      observation: expect.objectContaining({ status: 'unverified', revision: 1 }),
    }),
  ]);
  const serialized = JSON.stringify(localState[AI_PROVIDERS_KEY]);
  expect(serialized).not.toContain('foreign-');
  expect(serialized).not.toContain('catalogUpdatedAt');
});

async function installModernProviderSecret() {
  const material = await createAesGcmKeyMaterial();
  const provider = {
    ...createStoredProvider(),
    incarnation: 'local-incarnation',
    revision: 7,
    credentialRevision: 3,
    refreshGeneration: 'old-flight',
    catalogUpdatedAt: 123,
    lastRefreshAttemptAt: 123,
    observation: {
      status: 'available' as const,
      scope: 'catalog' as const,
      checkedAt: 123,
      revision: 7,
    },
  };
  const envelope = await encryptSecret(
    'modern-test-secret',
    material.key,
    createAIProviderSecretAdditionalData(provider)
  );
  installStorageState({
    [AI_PROVIDERS_KEY]: [provider],
    [AI_PROVIDER_SECRETS_KEY]: { [provider.id]: envelope },
    [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: material.material,
  });
  return { provider, envelope };
}

it('preserves a matching protected ciphertext while the key stays locked', async () => {
  const { provider } = await installModernProviderSecret();
  const protection = await import('./provider-secret-protection.store.ts');
  const owner = await import('./provider-secrets.store.ts');
  await protection.enableStoredAISecretPassphraseProtection('portable-test-passphrase');
  await protection.lockStoredAISecretProtection();
  const encryptedBefore = structuredClone(localState[AI_PROVIDER_SECRETS_KEY]);
  const plan = await owner.prepareAIProviderTransferMutation({
    importedProviders: [
      { ...selectSettingsTransferProviderMetadata(provider), hasStoredApiKey: false },
    ],
  });
  await plan.commit();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual(encryptedBefore);
  await expectPassphraseProtectionStatus(protection.loadStoredAISecretProtectionStatus, false);
  expectNoSessionPassphraseKeyMaterial();
  await expect(owner.loadStoredAIProviderSecret(provider.id)).resolves.toBeNull();
  await protection.unlockStoredAISecretProtection('portable-test-passphrase');
  await expect(owner.loadStoredAIProviderSecret(provider.id)).resolves.toBe('modern-test-secret');
});

it('restores a modern binding after partial write refusal and permits explicit retry', async () => {
  const { provider } = await installModernProviderSecret();
  const before = structuredClone(localState);
  const { prepareAIProviderTransferMutation, loadStoredAIProviderSecret } =
    await import('./provider-secrets.store.ts');
  const plan = await prepareAIProviderTransferMutation({
    importedProviders: [
      {
        ...selectSettingsTransferProviderMetadata(provider),
        name: 'Restored',
        hasStoredApiKey: false,
      },
    ],
  });
  localSetMock.mockImplementationOnce(async (values: Record<string, unknown>) => {
    Object.assign(localState, values);
    throw new Error('Transfer write refused');
  });
  await expect(plan.commit()).rejects.toThrow('Transfer write refused');
  expect(localState).toEqual(before);
  await plan.commit();
  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({
      id: provider.id,
      name: 'Restored',
      incarnation: provider.incarnation,
      hasStoredApiKey: true,
    }),
  ]);
  await expect(loadStoredAIProviderSecret(provider.id)).resolves.toBe('modern-test-secret');
});

it('does not reuse an imported old incarnation after deletion and same-ID restore', async () => {
  const owner = await import('./provider-secrets.store.ts');
  const imported = { ...createStoredProvider(), hasStoredApiKey: false };
  await (await owner.prepareAIProviderTransferMutation({ importedProviders: [imported] })).commit();
  const first = parseStoredAIProviders(localState[AI_PROVIDERS_KEY]).value[0]!;
  await owner.deleteStoredAIProviderRecord(first.id);
  await (await owner.prepareAIProviderTransferMutation({ importedProviders: [first] })).commit();
  const second = parseStoredAIProviders(localState[AI_PROVIDERS_KEY]).value[0]!;
  expect(second.id).toBe(first.id);
  expect(second.incarnation).toBeTruthy();
  expect(second.incarnation).not.toBe(first.incarnation);
});
