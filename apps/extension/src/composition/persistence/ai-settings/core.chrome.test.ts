import { beforeEach, expect, it, vi } from 'vitest';

import {
  AI_CHROME_ENABLED_KEY,
  AI_DEFAULT_MODEL_KEY,
  AI_GLOBAL_PROMPT_KEY,
  AI_MODELS_KEY,
  AI_SCENARIO_EDITOR_PROMPT_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';

const {
  clearStoredAIProviderSecretMock,
  deleteStoredAIProviderRecordMock,
  initializeAiStorageAccessMock,
  loadStoredAIProviderSecretMock,
  loadStoredAIProvidersMock,
  localGetMock,
  localSetMock,
  loggerInfoMock,
  saveStoredAIProvidersMock,
  syncSetMock,
  upsertStoredAIProviderRecordMock,
} = vi.hoisted(() => ({
  clearStoredAIProviderSecretMock: vi.fn(),
  deleteStoredAIProviderRecordMock: vi.fn(),
  initializeAiStorageAccessMock: vi.fn(),
  loadStoredAIProviderSecretMock: vi.fn(),
  loadStoredAIProvidersMock: vi.fn(),
  localGetMock: vi.fn(),
  localSetMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  saveStoredAIProvidersMock: vi.fn(),
  syncSetMock: vi.fn(),
  upsertStoredAIProviderRecordMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../infrastructure/browser-storage')>();

  return {
    ...original,
    browserStorage: {
      ...original.browserStorage,
      local: {
        ...original.browserStorage.local,
        get: localGetMock,
        remove: vi.fn(),
        set: localSetMock,
      },
      sync: {
        ...original.browserStorage.sync,
        get: vi.fn(),
        remove: vi.fn(),
        set: syncSetMock,
      },
    },
  };
});

vi.mock('./init', async (importOriginal) => {
  const original = await importOriginal<typeof import('./init')>();

  return {
    ...original,
    initializeAiStorageAccess: initializeAiStorageAccessMock,
  };
});

vi.mock('./provider-secrets.store.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./provider-secrets.store.ts')>();

  return {
    ...original,
    clearStoredAIProviderSecret: clearStoredAIProviderSecretMock,
    deleteStoredAIProviderRecord: deleteStoredAIProviderRecordMock,
    loadStoredAIProviderSecret: loadStoredAIProviderSecretMock,
    loadStoredAIProviders: loadStoredAIProvidersMock,
    saveStoredAIProviders: saveStoredAIProvidersMock,
    upsertStoredAIProviderRecord: upsertStoredAIProviderRecordMock,
  };
});

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sniptale/platform/observability/logger')>();

  return {
    ...original,
    createLogger: () => ({
      ...original.createLogger({ namespace: 'SharedAiStorageCoreTest' }),
      info: loggerInfoMock,
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  localGetMock.mockResolvedValue({
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    [AI_CHROME_ENABLED_KEY]: true,
  });
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
  loadStoredAIProviderSecretMock.mockResolvedValue('provider-secret');
  loadStoredAIProvidersMock.mockResolvedValue([]);
  localSetMock.mockResolvedValue(undefined);
  saveStoredAIProvidersMock.mockResolvedValue(undefined);
  syncSetMock.mockResolvedValue(undefined);
  upsertStoredAIProviderRecordMock.mockResolvedValue(undefined);
  clearStoredAIProviderSecretMock.mockResolvedValue(undefined);
  deleteStoredAIProviderRecordMock.mockResolvedValue(undefined);
});

function installLocalAiState() {
  const state = {
    [AI_CHROME_ENABLED_KEY]: true,
    [AI_DEFAULT_MODEL_KEY]: 'model-1',
    [AI_GLOBAL_PROMPT_KEY]: 'Global prompt',
    [AI_MODELS_KEY]: [
      {
        id: 'model-1',
        providerId: 'provider-1',
        modelCode: 'gpt-4.1',
        displayName: 'GPT 4.1',
      },
    ],
    [AI_SCENARIO_EDITOR_PROMPT_KEY]: 'Scenario prompt',
  };

  localGetMock.mockImplementation(async (keys?: string[]) =>
    keys === undefined
      ? state
      : keys.reduce<Record<string, unknown>>((result, key) => {
          if (key in state) {
            result[key] = state[key as keyof typeof state];
          }
          return result;
        }, {})
  );
}

it('keeps the chrome-ai enabled toggle in local-only storage', async () => {
  const { loadChromeAiEnabled, saveChromeAiEnabled } = await import('./core');

  await expect(loadChromeAiEnabled()).resolves.toBe(true);
  await saveChromeAiEnabled(false);

  expect(localGetMock).toHaveBeenCalledWith([AI_CHROME_ENABLED_KEY]);
  expect(localSetMock).toHaveBeenCalledWith({
    [AI_CHROME_ENABLED_KEY]: false,
  });
  expect(syncSetMock).not.toHaveBeenCalled();
});

it('falls back to false when the stored chrome-ai toggle is invalid', async () => {
  localGetMock.mockResolvedValue({
    [AI_CHROME_ENABLED_KEY]: 'true',
  });

  const { loadChromeAiEnabled } = await import('./core');

  await expect(loadChromeAiEnabled()).resolves.toBe(false);
});

it('delegates provider persistence helpers to the provider-secret store seam', async () => {
  loadStoredAIProvidersMock.mockResolvedValue([{ id: 'provider-1' }]);

  const {
    deleteAIProviderRecord,
    clearAIProviderSecret,
    loadAIProviderSecret,
    loadAIProviders,
    saveAIProviders,
    upsertAIProviderRecord,
  } = await import('./core');

  await expect(loadAIProviders()).resolves.toEqual([{ id: 'provider-1' }]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBe('provider-secret');
  await saveAIProviders([]);
  await upsertAIProviderRecord({
    id: 'provider-1',
    name: 'Provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://api.example.test',
    createdAt: 1,
  });
  await clearAIProviderSecret('provider-1');
  await deleteAIProviderRecord('provider-1');

  expect(saveStoredAIProvidersMock).toHaveBeenCalledWith([]);
  expect(upsertStoredAIProviderRecordMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'provider-1' })
  );
  expect(clearStoredAIProviderSecretMock).toHaveBeenCalledWith('provider-1');
  expect(deleteStoredAIProviderRecordMock).toHaveBeenCalledWith('provider-1');
});

it('covers the local-only ai storage read and write helpers around the chrome toggle path', async () => {
  installLocalAiState();

  const {
    loadAIModels,
    loadDefaultModelId,
    loadGlobalSystemPrompt,
    loadScenarioEditorSystemPrompt,
    saveAIModels,
    saveDefaultModelId,
  } = await import('./core');

  await expect(loadAIModels()).resolves.toEqual([
    {
      id: 'model-1',
      providerId: 'provider-1',
      modelCode: 'gpt-4.1',
      displayName: 'GPT 4.1',
    },
  ]);
  await expect(loadDefaultModelId()).resolves.toBe('model-1');
  await expect(loadGlobalSystemPrompt()).resolves.toBe('Global prompt');
  await expect(loadScenarioEditorSystemPrompt()).resolves.toBe('Scenario prompt');
  await saveAIModels([]);
  await saveDefaultModelId(null);

  expect(localSetMock).toHaveBeenCalledWith({
    [AI_MODELS_KEY]: [],
  });
  expect(localSetMock).toHaveBeenCalledWith({
    [AI_DEFAULT_MODEL_KEY]: null,
  });
});

it('saves both shared prompt variants through local storage only', async () => {
  const { saveGlobalSystemPrompt, saveScenarioEditorSystemPrompt } = await import('./core');

  await saveGlobalSystemPrompt('Updated global prompt');
  await saveScenarioEditorSystemPrompt('Updated scenario prompt');

  expect(localSetMock).toHaveBeenCalledWith({
    [AI_GLOBAL_PROMPT_KEY]: 'Updated global prompt',
  });
  expect(localSetMock).toHaveBeenCalledWith({
    [AI_SCENARIO_EDITOR_PROMPT_KEY]: 'Updated scenario prompt',
  });
  expect(syncSetMock).not.toHaveBeenCalled();
});
