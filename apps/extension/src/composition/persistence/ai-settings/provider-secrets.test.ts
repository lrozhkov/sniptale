import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import {
  createAesGcmKeyMaterial,
  encryptSecret,
} from '@sniptale/platform/security/local-secret-crypto';

const { localGetMock, localRemoveMock, localSetMock, syncGetMock, syncRemoveMock, syncSetMock } =
  vi.hoisted(() => ({
    localGetMock: vi.fn(),
    localRemoveMock: vi.fn(),
    localSetMock: vi.fn(),
    syncGetMock: vi.fn(),
    syncRemoveMock: vi.fn(),
    syncSetMock: vi.fn(),
  }));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: localGetMock,
      remove: localRemoveMock,
      set: localSetMock,
    },
    sync: {
      get: syncGetMock,
      remove: syncRemoveMock,
      set: syncSetMock,
    },
  },
}));

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

function createLegacyStoredProvider(id = 'provider-1') {
  return {
    id,
    name: `Provider ${id}`,
    connectionType: 'openai-compatible' as const,
    baseUrl: `https://${id}.example.com`,
    apiKey: `${id}-secret`,
    createdAt: 1,
  };
}

let localState: Record<string, unknown> = {};
let syncState: Record<string, unknown> = {};

function pickStateValues(
  state: Record<string, unknown>,
  keys?: string | string[]
): Record<string, unknown> {
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

function installStorageState({
  local = {},
  sync = {},
}: {
  local?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}) {
  localState = { ...local };
  syncState = { ...sync };

  localGetMock.mockImplementation(async (keys?: string | string[]) =>
    pickStateValues(localState, keys)
  );
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(localState, payload);
  });
  localRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete localState[key];
    }
  });
  syncGetMock.mockImplementation(async (keys?: string | string[]) =>
    pickStateValues(syncState, keys)
  );
  syncSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    Object.assign(syncState, payload);
  });
  syncRemoveMock.mockImplementation(async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete syncState[key];
    }
  });
}

function resetAiStorageProviderSecretMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
}

async function verifyMigrationFailureDoesNotAdvanceVersion() {
  installStorageState({
    local: {
      [AI_PROVIDERS_KEY]: [createLegacyStoredProvider('provider-1')],
    },
    sync: {
      sniptale_settings: {
        apiBaseUrl: 'https://legacy.example.com',
        apiKey: 'legacy-secret',
        modelName: 'legacy-model',
      },
    },
  });

  let localSetCallCount = 0;
  localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
    localSetCallCount += 1;
    Object.assign(localState, payload);

    if (localSetCallCount === 2) {
      throw new Error('migration write failed');
    }
  });

  const { initializeAiStorageAccess } = await import('./init');

  await expect(initializeAiStorageAccess()).rejects.toThrow('migration write failed');
  expect(localState[AI_STORAGE_VERSION_KEY]).toBeUndefined();
  expect(localState[AI_STORAGE_MIGRATION_PHASE_KEY]).toBe(AI_PROVIDER_STORAGE_MIGRATION_PHASE);
  expect(localState[AI_PROVIDERS_KEY]).toEqual([createStoredProvider('provider-1')]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({
    'provider-1': expect.objectContaining({
      algorithm: 'AES-GCM',
      version: 2,
    }),
  });
  expect(syncState['sniptale_settings']).toEqual({
    apiBaseUrl: 'https://legacy.example.com',
    apiKey: 'legacy-secret',
    modelName: 'legacy-model',
  });

  await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
  expect(localState[AI_STORAGE_VERSION_KEY]).toBe(AI_STORAGE_VERSION);
  expect(localState[AI_STORAGE_MIGRATION_PHASE_KEY]).toBeUndefined();
}

async function verifyProviderSecretLifecycle() {
  installStorageState({
    local: {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    },
  });

  const { deleteAIProviderRecord, loadAIProviderSecret, loadAIProviders, upsertAIProviderRecord } =
    await import('./core');

  await upsertAIProviderRecord({
    ...createLegacyStoredProvider('provider-1'),
  });
  await expect(loadAIProviders()).resolves.toEqual([createStoredProvider('provider-1')]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toEqual(expect.any(String));

  await upsertAIProviderRecord({
    id: 'provider-1',
    name: 'Updated provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://provider-1.example.com',
    createdAt: 1,
  });
  await expect(loadAIProviders()).resolves.toEqual([
    {
      ...createStoredProvider('provider-1'),
      name: 'Updated provider',
    },
  ]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');

  await upsertAIProviderRecord({
    id: 'provider-1',
    name: 'Updated provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://provider-1.example.com',
    createdAt: 1,
    apiKey: 'rotated-secret',
  });
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('rotated-secret');

  await deleteAIProviderRecord('provider-1');
  await expect(loadAIProviders()).resolves.toEqual([]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBeNull();
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
}

async function verifyMigrationPreservesValidEncryptedStorage() {
  const created = await createAesGcmKeyMaterial();
  const storedSecret = await encryptSecret('provider-1-secret', created.key);

  installStorageState({
    local: {
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
      [AI_PROVIDER_SECRETS_KEY]: {
        'provider-1': storedSecret,
      },
      [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: created.material,
    },
    sync: {
      sniptale_settings: {
        captureAction: 'download_default',
      },
    },
  });

  const { migrateAiProviderStorageToV3 } = await import('./provider-secrets.migration.ts');

  await expect(migrateAiProviderStorageToV3()).resolves.toBeUndefined();
  expect(localState[AI_PROVIDERS_KEY]).toEqual([createStoredProvider('provider-1')]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({
    'provider-1': storedSecret,
  });
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe(created.material);
  expect(localState[AI_STORAGE_VERSION_KEY]).toBe(AI_STORAGE_VERSION);
  expect(syncSetMock).not.toHaveBeenCalled();
}

async function verifyMigrationWarnsAboutInvalidSecretsPayload() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  installStorageState({
    local: {
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
      [AI_PROVIDER_SECRETS_KEY]: [],
    },
  });

  const { migrateAiProviderStorageToV3 } = await import('./provider-secrets.migration.ts');

  await expect(migrateAiProviderStorageToV3()).resolves.toBeUndefined();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({});
  expect(localState[AI_STORAGE_VERSION_KEY]).toBe(AI_STORAGE_VERSION);
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedAiStorage]',
    'Ignoring invalid AI provider secrets payload root',
    { storageKey: AI_PROVIDER_SECRETS_KEY }
  );
}

describe('ai.provider-secrets', () => {
  beforeEach(resetAiStorageProviderSecretMocks);

  it(
    'retries migration after a failed v3 write without advancing the version marker',
    verifyMigrationFailureDoesNotAdvanceVersion
  );
  it(
    'encrypts, preserves, rotates, and deletes provider secrets in v3 storage',
    verifyProviderSecretLifecycle
  );
  it(
    'preserves already-encrypted provider storage when migration runs on a valid v3 payload',
    verifyMigrationPreservesValidEncryptedStorage
  );
  it(
    'warns and resets invalid encrypted provider secret payloads during migration',
    verifyMigrationWarnsAboutInvalidSecretsPayload
  );
});
