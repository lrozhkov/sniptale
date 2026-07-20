import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_DEFAULT_MODEL_KEY,
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';

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

let localState: Record<string, unknown> = {};
let syncState: Record<string, unknown> = {};

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

function createStoredModel(id: string, providerId = 'provider-1') {
  return {
    displayName: `Model ${id}`,
    id,
    modelCode: `${id}-code`,
    providerId,
  };
}

function createStoredSecretEnvelope(id: string) {
  return {
    algorithm: 'AES-GCM',
    ciphertext: `${id}-ciphertext`,
    iv: `${id}-iv`,
    version: 1,
  };
}

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
  syncRemoveMock.mockImplementation(async (keys: string[]) => {
    for (const key of keys) {
      delete syncState[key];
    }
  });
}

function resetAiStorageCoreQueueMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({
    local: {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
    },
  });
}

beforeEach(resetAiStorageCoreQueueMocks);

it('persists, loads, and deletes provider records through the low-level storage adapter', async () => {
  const { deleteAIProviderRecord, loadAIProviderSecret, saveAIProviders, upsertAIProviderRecord } =
    await import('./core');

  await saveAIProviders([createStoredProvider('provider-1')]);
  await upsertAIProviderRecord({
    ...createStoredProvider('provider-2'),
    apiKey: 'provider-2-secret',
  });
  await expect(loadAIProviderSecret('provider-2')).resolves.toBe('provider-2-secret');
  await deleteAIProviderRecord('provider-1');

  expect(localState[AI_PROVIDERS_KEY]).toEqual([
    expect.objectContaining({ id: 'provider-2', hasStoredApiKey: true }),
  ]);
});

it('deletes provider metadata, secrets, owned models, and default in one graph write', async () => {
  installStorageState({
    local: {
      [AI_DEFAULT_MODEL_KEY]: 'model-1',
      [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: 'transparent-key-material',
      [AI_MODELS_KEY]: [
        createStoredModel('model-1', 'provider-1'),
        createStoredModel('model-2', 'provider-2'),
      ],
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1'), createStoredProvider('provider-2')],
      [AI_PROVIDER_SECRETS_KEY]: {
        'provider-1': createStoredSecretEnvelope('provider-1'),
        'provider-2': createStoredSecretEnvelope('provider-2'),
      },
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    },
  });

  const { deleteAIProviderGraphRecord } = await import('./core');

  await deleteAIProviderGraphRecord('provider-1');

  expect(localSetMock).toHaveBeenCalledWith({
    [AI_DEFAULT_MODEL_KEY]: null,
    [AI_MODELS_KEY]: [createStoredModel('model-2', 'provider-2')],
    [AI_PROVIDERS_KEY]: [createStoredProvider('provider-2')],
    [AI_PROVIDER_SECRETS_KEY]: {
      'provider-2': createStoredSecretEnvelope('provider-2'),
    },
  });
  expect(localState[AI_DEFAULT_MODEL_KEY]).toBeNull();
  expect(localState[AI_MODELS_KEY]).toEqual([createStoredModel('model-2', 'provider-2')]);
  expect(localState[AI_PROVIDERS_KEY]).toEqual([createStoredProvider('provider-2')]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({
    'provider-2': createStoredSecretEnvelope('provider-2'),
  });
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBe('transparent-key-material');
});

it('preserves the default model when deleting a provider that does not own it', async () => {
  installStorageState({
    local: {
      [AI_DEFAULT_MODEL_KEY]: 'model-2',
      [AI_MODELS_KEY]: [
        createStoredModel('model-1', 'provider-1'),
        createStoredModel('model-2', 'provider-2'),
      ],
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1'), createStoredProvider('provider-2')],
      [AI_PROVIDER_SECRETS_KEY]: {
        'provider-1': createStoredSecretEnvelope('provider-1'),
        'provider-2': createStoredSecretEnvelope('provider-2'),
      },
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    },
  });

  const { deleteAIProviderGraphRecord } = await import('./core');

  await deleteAIProviderGraphRecord('provider-1');

  expect(localState[AI_DEFAULT_MODEL_KEY]).toBe('model-2');
  expect(localState[AI_MODELS_KEY]).toEqual([createStoredModel('model-2', 'provider-2')]);
});

it('writes model and default-model updates through one graph mutation', async () => {
  const { saveAIModelGraph } = await import('./core');
  const nextModels = [createStoredModel('model-2', 'provider-2')];

  await saveAIModelGraph(nextModels, 'model-2');

  expect(localSetMock).toHaveBeenCalledWith({
    [AI_DEFAULT_MODEL_KEY]: 'model-2',
    [AI_MODELS_KEY]: nextModels,
  });
  expect(localState[AI_DEFAULT_MODEL_KEY]).toBe('model-2');
  expect(localState[AI_MODELS_KEY]).toEqual(nextModels);
});

it('keeps provider graph state unchanged when the graph write fails', async () => {
  installStorageState({
    local: {
      [AI_DEFAULT_MODEL_KEY]: 'model-1',
      [AI_MODELS_KEY]: [createStoredModel('model-1', 'provider-1')],
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
      [AI_PROVIDER_SECRETS_KEY]: {
        'provider-1': createStoredSecretEnvelope('provider-1'),
      },
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    },
  });
  const beforeFailure = { ...localState };
  localSetMock.mockRejectedValueOnce(new Error('storage write failed'));

  const { deleteAIProviderGraphRecord } = await import('./core');

  await expect(deleteAIProviderGraphRecord('provider-1')).rejects.toThrow('storage write failed');
  expect(localState).toEqual(beforeFailure);
  expect(localRemoveMock).not.toHaveBeenCalled();
});

it('removes transparent key material after deleting the last provider secret', async () => {
  installStorageState({
    local: {
      [AI_DEFAULT_MODEL_KEY]: 'model-1',
      [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: 'transparent-key-material',
      [AI_MODELS_KEY]: [createStoredModel('model-1', 'provider-1')],
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
      [AI_PROVIDER_SECRETS_KEY]: {
        'provider-1': createStoredSecretEnvelope('provider-1'),
      },
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    },
  });

  const { deleteAIProviderGraphRecord } = await import('./core');

  await deleteAIProviderGraphRecord('provider-1');

  expect(localRemoveMock).toHaveBeenCalledWith(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
});
