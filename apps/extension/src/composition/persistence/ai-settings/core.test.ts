import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_MODELS_KEY,
  AI_VOICE_INPUT_CORRECTION_PROMPT_KEY,
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
    session: { get: vi.fn(async () => ({})), remove: vi.fn() },
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
  expect(localState[AI_LOCAL_SECRET_KEY_STORAGE_KEY]).toBeUndefined();
  expect(localState[AI_PROVIDER_SECRETS_KEY]).toBeUndefined();
  expect(localState[AI_STORAGE_MIGRATION_PHASE_KEY]).toBeUndefined();
  expect(syncState['sniptale_settings']).toMatchObject({ captureAction: 'download_default' });
  expect(syncState['sniptale_settings']).not.toHaveProperty('apiKey');
  expect(syncState['sniptale_settings']).not.toHaveProperty('apiBaseUrl');
}
function expectLegacyAiStorageState() {
  expect(localState[AI_STORAGE_VERSION_KEY]).toBe(AI_STORAGE_VERSION);
  expect(localState[AI_PROVIDERS_KEY]).toEqual([]);
  expect(localState[AI_MODELS_KEY]).toEqual([]);
}
async function verifyOneTimeReset() {
  installLegacyAiStorageState();
  const { loadAIModels, loadAIProviderSecret, loadAIProviders } = await import('./core');
  const { initializeAiStorageAccess, readAiStorageReadiness } = await import('./init');

  await expect(readAiStorageReadiness()).resolves.toMatchObject({
    isReady: false,
    requiresReset: true,
  });
  await expect(initializeAiStorageAccess()).resolves.toBeUndefined();

  await expect(loadAIProviders()).resolves.toEqual([]);
  await expect(loadAIModels()).resolves.toEqual([]);
  await expect(loadAIProviderSecret('provider-1')).resolves.toBeNull();

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
    resetGlobalSystemPrompt,
    resetScenarioEditorSystemPrompt,
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
  await resetGlobalSystemPrompt();
  await resetScenarioEditorSystemPrompt();

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
  expect(localRemoveMock).toHaveBeenNthCalledWith(1, 'sniptale_ai_global_prompt');
  expect(localRemoveMock).toHaveBeenNthCalledWith(2, 'sniptale_ai_scenario_editor_prompt');
  await expect(loadGlobalSystemPrompt()).resolves.toBe(DEFAULT_GLOBAL_SYSTEM_PROMPT);
  await expect(loadScenarioEditorSystemPrompt()).resolves.toBe(
    DEFAULT_SCENARIO_EDITOR_SYSTEM_PROMPT
  );
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

it('bounds additional recognition instructions and saves/resets them only locally', async () => {
  installStorageState({ local: { [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION } });
  const {
    loadAudioTranscriptionSystemPrompt,
    saveAudioTranscriptionSystemPrompt,
    resetAudioTranscriptionSystemPrompt,
  } = await import('./core');
  const { DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT } = await import('./constants');
  await expect(loadAudioTranscriptionSystemPrompt()).resolves.toBe(
    DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT
  );
  await saveAudioTranscriptionSystemPrompt('Keep phrasing');
  await expect(loadAudioTranscriptionSystemPrompt()).resolves.toBe('Keep phrasing');
  expect(syncSetMock).not.toHaveBeenCalled();
  await expect(saveAudioTranscriptionSystemPrompt('x'.repeat(10001))).rejects.toThrow(
    'Invalid transcription instructions'
  );
  await expect(loadAudioTranscriptionSystemPrompt()).resolves.toBe('Keep phrasing');
  await resetAudioTranscriptionSystemPrompt();
  await expect(loadAudioTranscriptionSystemPrompt()).resolves.toBe(
    DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT
  );
});

it('includes local recognition instructions in the aggregate settings query', async () => {
  installStorageState({
    local: {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      sniptale_ai_audio_transcription_prompt: 'Keep the original meaning',
      sniptale_ai_global_prompt: 'Global instructions',
      sniptale_ai_chrome_enabled: true,
    },
  });
  const { loadAISettings } = await import('./settings');
  await expect(loadAISettings()).resolves.toMatchObject({
    audioTranscriptionSystemPrompt: 'Keep the original meaning',
    globalSystemPrompt: 'Global instructions',
    providers: [],
    models: [],
  });
  expect(syncSetMock).not.toHaveBeenCalled();
});

it('keeps bounded voice correction instructions local and reads without repair', async () => {
  resetAiStorageCoreMocks();
  installStorageState({ local: { [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION } });
  const {
    loadVoiceInputCorrectionSystemPrompt,
    saveVoiceInputCorrectionSystemPrompt,
    resetVoiceInputCorrectionSystemPrompt,
  } = await import('./core');
  const { DEFAULT_VOICE_INPUT_CORRECTION_SYSTEM_PROMPT } = await import('./constants');
  await expect(loadVoiceInputCorrectionSystemPrompt()).resolves.toBe(
    DEFAULT_VOICE_INPUT_CORRECTION_SYSTEM_PROMPT
  );
  expect(localSetMock).not.toHaveBeenCalled();
  await saveVoiceInputCorrectionSystemPrompt('Исправь пунктуацию. '.repeat(400));
  const saved = await loadVoiceInputCorrectionSystemPrompt();
  expect(saved).toContain('Исправь пунктуацию.');
  expect(syncSetMock).not.toHaveBeenCalled();
  await expect(saveVoiceInputCorrectionSystemPrompt('x'.repeat(10001))).rejects.toThrow(
    'Invalid voice correction instructions'
  );
  await expect(loadVoiceInputCorrectionSystemPrompt()).resolves.toBe(saved);
  await resetVoiceInputCorrectionSystemPrompt();
  await expect(loadVoiceInputCorrectionSystemPrompt()).resolves.toBe(
    DEFAULT_VOICE_INPUT_CORRECTION_SYSTEM_PROMPT
  );
});

async function installPromptErasureOrdering() {
  const barrier = await import('../infrastructure/mutation-barrier');
  const requested = Promise.withResolvers<void>();
  const queues = new Map<string, Promise<void>>();
  barrier.installPersistenceLockManagerForTests({
    request(name, options, operation) {
      if (options.mode === 'exclusive' && name.endsWith(':transition')) requested.resolve();
      const next = (queues.get(name) ?? Promise.resolve()).then(() => operation());
      queues.set(
        name,
        next.then(
          () => undefined,
          () => undefined
        )
      );
      return next;
    },
  });
  return { ...barrier, requested };
}

it.each([
  { operation: 'save', preservePreferences: false },
  { operation: 'save', preservePreferences: true },
  { operation: 'reset', preservePreferences: false },
  { operation: 'reset', preservePreferences: true },
] as const)(
  'orders queued correction $operation before verified erasure with preservePreferences=$preservePreferences',
  async ({ operation, preservePreferences }) => {
    resetAiStorageCoreMocks();
    installStorageState({ local: { [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION } });
    const { mutateStoredAISettings } = await import('./graph-mutations');
    const { buildBrowserStorageErasurePlan } = await import('../privacy-erasure/inventory');
    const barrier = await installPromptErasureOrdering();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const read = localGetMock.getMockImplementation()!;
    localGetMock.mockImplementation(async (keys?: string | string[]) => {
      if (Array.isArray(keys) && keys.includes(AI_MODELS_KEY)) {
        entered.resolve();
        await release.promise;
      }
      return read(keys);
    });
    const events: string[] = [];
    const write = localSetMock.getMockImplementation()!;
    localSetMock.mockImplementation(async (payload: Record<string, unknown>) => {
      if (AI_VOICE_INPUT_CORRECTION_PROMPT_KEY in payload) events.push('save');
      return write(payload);
    });
    const remove = localRemoveMock.getMockImplementation()!;
    localRemoveMock.mockImplementation(async (keys: string | string[]) => {
      if (keys === AI_VOICE_INPUT_CORRECTION_PROMPT_KEY) events.push('reset');
      return remove(keys);
    });
    try {
      const saving = mutateStoredAISettings(
        operation === 'save'
          ? {
              operation: 'save-voice-input-correction-prompt',
              prompt: 'private correction instructions',
            }
          : { operation: 'reset-voice-input-correction-prompt' }
      );
      await entered.promise;
      const erasing = barrier.runWithPersistentDataErasureBarrier(async () => {
        const plan = buildBrowserStorageErasurePlan({
          preservePreferences,
          includeAiProviderSecrets: true,
        });
        await localRemoveMock(plan.local);
        expect(localState).not.toHaveProperty(AI_VOICE_INPUT_CORRECTION_PROMPT_KEY);
        events.push('erased');
      });
      await barrier.requested.promise;
      release.resolve();
      await saving;
      await erasing;
      expect(events).toEqual([operation, 'erased']);
      expect(localState).not.toHaveProperty(AI_VOICE_INPUT_CORRECTION_PROMPT_KEY);
    } finally {
      barrier.installPersistenceLockManagerForTests(null);
    }
  }
);
