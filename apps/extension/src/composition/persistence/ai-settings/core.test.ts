import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PROVIDER_STORAGE_MIGRATION_PHASE,
  AI_PROVIDERS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_STORAGE_MIGRATION_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
  DEFAULT_GLOBAL_SYSTEM_PROMPT,
  DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT,
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
  ...(await importOriginal()),
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
  localRemoveMock.mockImplementation(async (keys: string[]) => {
    for (const key of keys) {
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

function resetAiStorageCoreMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  installStorageState({});
}

function installLegacyAiStorageState() {
  installStorageState({
    local: {
      [AI_PROVIDERS_KEY]: [createLegacyStoredProvider('provider-1')],
    },
    sync: {
      sniptale_settings: {
        apiBaseUrl: 'https://legacy.example.com',
        apiKey: 'legacy-secret',
        modelName: 'legacy-model',
        captureAction: 'download_default',
      },
    },
  });
}
function expectLegacyAiStorageCleanup() {
  expect(localRemoveMock).toHaveBeenCalledTimes(2);
  expect(localRemoveMock).toHaveBeenNthCalledWith(1, ['sniptale_master_key_material']);
  expect(localRemoveMock).toHaveBeenNthCalledWith(2, [AI_STORAGE_MIGRATION_PHASE_KEY]);
  expect(syncRemoveMock).toHaveBeenCalledTimes(1);
  expect(syncRemoveMock).toHaveBeenCalledWith([
    'sniptale_ai_default_model',
    'sniptale_ai_global_prompt',
    'sniptale_ai_scenario_editor_prompt',
  ]);
  expect(syncSetMock).toHaveBeenCalledWith({
    sniptale_settings: {
      captureAction: 'download_default',
    },
  });
}
function expectLegacyAiStorageState() {
  expect(localState[AI_STORAGE_VERSION_KEY]).toBe(AI_STORAGE_VERSION);
  expect(localState[AI_PROVIDERS_KEY]).toEqual([createStoredProvider('provider-1')]);
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toEqual({
    'provider-1': expect.objectContaining({
      algorithm: 'AES-GCM',
      version: 2,
    }),
  });
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toEqual(expect.any(String));
  expect(localState[AI_STORAGE_MIGRATION_PHASE_KEY]).toBeUndefined();
}
async function verifyOneTimeReset() {
  installLegacyAiStorageState();
  const { loadAIModels, loadAIProviderSecret, loadAIProviders } = await import('./core');
  const { initializeAiStorageAccess, readAiStorageReadiness } = await import('./init');

  await expect(readAiStorageReadiness()).resolves.toMatchObject({
    isReady: false,
    requiresMigration: true,
  });
  await expect(initializeAiStorageAccess()).resolves.toBeUndefined();

  await expect(loadAIProviders()).resolves.toEqual([createStoredProvider('provider-1')]);
  await expect(loadAIModels()).resolves.toEqual([]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('provider-1-secret');

  expectLegacyAiStorageCleanup();
  expectLegacyAiStorageState();
}

async function verifyVersionedSkip() {
  installStorageState({
    local: {
      [AI_STORAGE_MIGRATION_PHASE_KEY]: AI_PROVIDER_STORAGE_MIGRATION_PHASE,
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      [AI_PROVIDERS_KEY]: [createStoredProvider('provider-1')],
    },
  });

  const { loadAIProviders } = await import('./core');
  const { initializeAiStorageAccess } = await import('./init');

  await expect(initializeAiStorageAccess()).resolves.toBeUndefined();
  await expect(loadAIProviders()).resolves.toEqual([createStoredProvider('provider-1')]);
  await expect(loadAIProviders()).resolves.toEqual([createStoredProvider('provider-1')]);

  expect(syncGetMock).not.toHaveBeenCalled();
  expect(syncSetMock).not.toHaveBeenCalled();
  expect(syncRemoveMock).not.toHaveBeenCalled();
  expect(localRemoveMock).not.toHaveBeenCalled();
  expect(localState[AI_STORAGE_MIGRATION_PHASE_KEY]).toBe(AI_PROVIDER_STORAGE_MIGRATION_PHASE);
}

async function verifyLocalOnlyDefaultStorage() {
  installStorageState({
    local: {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      sniptale_ai_default_model: 'model-42',
      sniptale_ai_global_prompt: 'Prompt text',
      sniptale_ai_scenario_editor_prompt: 'Scenario prompt',
    },
  });

  const {
    loadDefaultModelId,
    loadGlobalSystemPrompt,
    loadScenarioEditorSystemPrompt,
    saveDefaultModelId,
    saveGlobalSystemPrompt,
    saveScenarioEditorSystemPrompt,
  } = await import('./core');

  await expect(loadDefaultModelId()).resolves.toBe('model-42');
  await expect(loadGlobalSystemPrompt()).resolves.toBe('Prompt text');
  await expect(loadScenarioEditorSystemPrompt()).resolves.toBe('Scenario prompt');

  await saveDefaultModelId('model-99');
  await saveGlobalSystemPrompt('Updated prompt');
  await saveScenarioEditorSystemPrompt('Updated scenario prompt');

  expect(localSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_ai_default_model: 'model-99',
  });
  expect(localSetMock).toHaveBeenNthCalledWith(2, {
    sniptale_ai_global_prompt: 'Updated prompt',
  });
  expect(localSetMock).toHaveBeenNthCalledWith(3, {
    sniptale_ai_scenario_editor_prompt: 'Updated scenario prompt',
  });
  expect(syncSetMock).not.toHaveBeenCalled();
  expect(syncRemoveMock).not.toHaveBeenCalled();
}

async function verifyInvalidStoredValuesFallback() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  installStorageState({
    local: {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      sniptale_ai_providers: [createStoredProvider('provider-1'), { id: 'broken' }],
      sniptale_ai_models: { invalid: true },
      sniptale_ai_default_model: 42,
      sniptale_ai_global_prompt: 5,
      sniptale_ai_scenario_editor_prompt: false,
    },
  });

  const {
    loadAIModels,
    loadAIProviders,
    loadDefaultModelId,
    loadGlobalSystemPrompt,
    loadScenarioEditorSystemPrompt,
  } = await import('./core');

  await expect(loadAIProviders()).resolves.toEqual([createStoredProvider('provider-1')]);
  await expect(loadAIModels()).resolves.toEqual([]);
  await expect(loadDefaultModelId()).resolves.toBeNull();
  await expect(loadGlobalSystemPrompt()).resolves.toBe(DEFAULT_GLOBAL_SYSTEM_PROMPT);
  await expect(loadScenarioEditorSystemPrompt()).resolves.toBe(
    DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT
  );

  expect(warnSpy).toHaveBeenNthCalledWith(
    1,
    '[SharedAiStorage]',
    'Dropped invalid AI storage entries',
    { storageKey: 'sniptale_ai_providers', invalidEntryCount: 1 }
  );
  expect(warnSpy).toHaveBeenNthCalledWith(
    2,
    '[SharedAiStorage]',
    'Ignoring invalid AI storage payload root',
    { storageKey: 'sniptale_ai_models' }
  );
}

describe('ai/core', () => {
  beforeEach(resetAiStorageCoreMocks);

  it('resets legacy AI state once and records the storage version', verifyOneTimeReset);
  it('skips the reset path when the version marker already exists', verifyVersionedSkip);
  it('keeps default model and prompt storage local-only', verifyLocalOnlyDefaultStorage);
  it(
    'drops invalid stored AI values and falls back on invalid scalar roots',
    verifyInvalidStoredValuesFallback
  );
});
