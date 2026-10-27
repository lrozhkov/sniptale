import { beforeEach, expect, it, vi } from 'vitest';

import { CHROME_AI_MODEL_ID } from '../../features/ai/chrome/constants';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const queryMocks = vi.hoisted(() => ({
  loadChromeAiAvailability: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/chrome-ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/chrome-ai')>()),
  loadChromeAiAvailability: queryMocks.loadChromeAiAvailability,
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: queryMocks.sendRuntimeMessage,
}));

import {
  refreshManagedAICatalogs,
  requestAIScenarioModelSelection,
  rememberAIScenarioModelSelection,
  requestAISettingsPageRuntimeData,
  requestChromeAiContentSystemPrompt,
  requestScenarioEditorSystemPrompt,
} from './query';

beforeEach(() => {
  vi.clearAllMocks();
  queryMocks.loadChromeAiAvailability.mockResolvedValue('unsupported');
});

function mockScenarioCatalog(chromeAiEnabled = false) {
  queryMocks.sendRuntimeMessage.mockImplementation(async (message) =>
    message.operation === 'read-scenario-selection'
      ? { success: true, scenarioSelection: null }
      : {
          success: true,
          modelSelection: {
            chromeAiEnabled,
            globalSystemPrompt: 'Prompt',
            models: [{ displayName: 'Model', id: 'model-1', modelCode: 'm', providerId: 'p' }],
            providers: [
              {
                connectionType: 'openai-compatible',
                createdAt: 1,
                destinationKind: 'external',
                hasStoredApiKey: true,
                id: 'p',
                name: 'Provider',
              },
            ],
          },
        }
  );
}

it('requests sanitized scenario catalog and remembered selection without writing', async () => {
  mockScenarioCatalog();
  await expect(requestAIScenarioModelSelection('page-edit')).resolves.toMatchObject({
    globalSystemPrompt: 'Prompt',
    resolution: { status: 'initial', modelId: 'model-1' },
    providers: [expect.not.objectContaining({ baseUrl: expect.any(String) })],
  });
  expect(queryMocks.sendRuntimeMessage.mock.calls.map(([message]) => message)).toEqual([
    { operation: 'read-model-selection-bootstrap', type: MessageType.AI_SETTINGS_QUERY },
    {
      operation: 'read-scenario-selection',
      scenario: 'page-edit',
      type: MessageType.AI_SETTINGS_QUERY,
    },
  ]);
});

it('adds available Chrome models only to supported page scenarios', async () => {
  mockScenarioCatalog(true);
  queryMocks.loadChromeAiAvailability.mockResolvedValue('available');
  const page = await requestAIScenarioModelSelection('page-edit');
  expect(page.models.map((model) => model.id)).toContain(CHROME_AI_MODEL_ID);
  expect(page.providers).toContainEqual(
    expect.objectContaining({ destinationKind: 'chrome-built-in' })
  );
  const scenario = await requestAIScenarioModelSelection('scenario-edit');
  expect(scenario.models.map((model) => model.id)).not.toContain(CHROME_AI_MODEL_ID);
});

it('omits unavailable Chrome models without writing a fallback', async () => {
  mockScenarioCatalog(true);
  const page = await requestAIScenarioModelSelection('page-edit');
  expect(page.models.map((model) => model.id)).toEqual(['model-1']);
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
});

it('propagates a refused scenario query without mutation or retry', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ error: 'denied', success: false });
  await expect(requestAIScenarioModelSelection('page-edit')).rejects.toThrow('denied');
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
  expect(
    queryMocks.sendRuntimeMessage.mock.calls.every(
      ([message]) => message.type === MessageType.AI_SETTINGS_QUERY
    )
  ).toBe(true);
});

it.each(['catalog', 'selection'])('rejects a missing scenario %s payload', async (missing) => {
  mockScenarioCatalog();
  const implementation = queryMocks.sendRuntimeMessage.getMockImplementation()!;
  queryMocks.sendRuntimeMessage.mockImplementation(async (message) =>
    message.operation ===
    (missing === 'catalog' ? 'read-model-selection-bootstrap' : 'read-scenario-selection')
      ? { success: true }
      : implementation(message)
  );
  await expect(requestAIScenarioModelSelection('page-edit')).rejects.toThrow(
    'AI scenario selection response missing payload'
  );
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
});

it('keeps full provider metadata scoped to settings page runtime data', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    settingsRuntimeData: {
      scenarioEditorSystemPrompt: 'Scenario prompt',
      secretProtectionStatus: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
      selectionBootstrap: {
        chromeAiEnabled: false,
        globalSystemPrompt: '',
        models: [],
        providers: [
          {
            baseUrl: 'https://api.provider.test/v1',
            connectionType: 'openai-compatible',
            createdAt: 1,
            hasStoredApiKey: true,
            id: 'provider-1',
            name: 'Provider',
          },
        ],
      },
    },
    success: true,
  });

  await expect(requestAISettingsPageRuntimeData()).resolves.toMatchObject({
    selectionBootstrap: {
      providers: [expect.objectContaining({ baseUrl: 'https://api.provider.test/v1' })],
    },
  });
});

it('requests Chrome AI content prompt without exposing provider metadata', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ success: true, systemPrompt: 'Prompt' });

  await expect(requestChromeAiContentSystemPrompt('model-1')).resolves.toBe('Prompt');
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    modelId: 'model-1',
    operation: 'read-chrome-ai-content-system-prompt',
    type: MessageType.AI_SETTINGS_QUERY,
  });
});

it('requests scenario editor system prompt through the background-owned query route', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    scenarioEditorSystemPrompt: 'Scenario prompt',
    success: true,
  });

  await expect(requestScenarioEditorSystemPrompt()).resolves.toBe('Scenario prompt');
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    operation: 'read-scenario-editor-system-prompt',
    type: MessageType.AI_SETTINGS_QUERY,
  });
});

it('throws when prompt query responses omit their payloads', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ success: true });

  await expect(requestScenarioEditorSystemPrompt()).rejects.toThrow(
    'Scenario editor system prompt response missing payload'
  );
  await expect(requestChromeAiContentSystemPrompt('model-1')).rejects.toThrow(
    'Chrome AI content system prompt response missing payload'
  );
});

it('filters the current scenario catalog and never adds Chrome models to voice recognition', async () => {
  const text = { id: 'text', providerId: 'p', modelCode: 'text', displayName: 'Text' };
  const speech = {
    ...text,
    id: 'speech',
    operation: 'speech',
    audio: { speech: { voiceId: 'custom', responseFormat: 'mp3' } },
  };
  const transcription = {
    ...text,
    id: 'transcription',
    operation: 'transcription',
    audio: { transcription: { responseFormat: 'json', timestampGranularity: 'none' } },
  };
  mockScenarioCatalog(true);
  const implementation = queryMocks.sendRuntimeMessage.getMockImplementation()!;
  queryMocks.sendRuntimeMessage.mockImplementation(async (message) => {
    const response = await implementation(message);
    return response.modelSelection
      ? {
          ...response,
          modelSelection: { ...response.modelSelection, models: [text, speech, transcription] },
        }
      : response;
  });
  queryMocks.loadChromeAiAvailability.mockResolvedValue('available');
  expect(
    (await requestAIScenarioModelSelection('page-edit')).models.map((model) => model.id)
  ).toEqual(['text', CHROME_AI_MODEL_ID]);
  const voice = await requestAIScenarioModelSelection('voice-recognition');
  expect(voice.models).toEqual([transcription]);
  expect(voice.providers.some((provider) => provider.destinationKind === 'chrome-built-in')).toBe(
    false
  );
  expect(voice.resolution).toMatchObject({ status: 'empty', modelId: null });
});

it('resolves a first-use scenario candidate without inheriting or writing the global default', async () => {
  const models = ['a-model', 'b-model'].map((id) => ({
    id,
    modelCode: id,
    displayName: id,
    providerId: 'provider',
  }));
  queryMocks.sendRuntimeMessage.mockImplementation(async (message) =>
    message.operation === 'read-scenario-selection'
      ? { success: true, scenarioSelection: null }
      : {
          success: true,
          modelSelection: {
            chromeAiEnabled: false,
            globalSystemPrompt: 'Retained global system prompt',
            models,
            providers: [
              {
                id: 'provider',
                name: 'Provider',
                incarnation: 'incarnation',
                createdAt: 1,
                hasStoredApiKey: true,
                connectionType: 'neuraldeep',
                destinationKind: 'external',
                destinationBinding: 'sha256:' + 'a'.repeat(64),
              },
            ],
          },
        }
  );
  const context = await requestAIScenarioModelSelection('page-edit');
  expect(context.globalSystemPrompt).toBe('Retained global system prompt');
  expect(context.resolution).toMatchObject({ status: 'initial', modelId: 'a-model' });
  expect(
    queryMocks.sendRuntimeMessage.mock.calls.every(
      ([message]) => message.type === MessageType.AI_SETTINGS_QUERY
    )
  ).toBe(true);
  queryMocks.sendRuntimeMessage.mockResolvedValue({ success: false, error: 'Storage refused' });
  await expect(rememberAIScenarioModelSelection(context, 'page-edit', 'b-model')).rejects.toThrow(
    'Storage refused'
  );
  expect(queryMocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'remember-scenario-selection',
      selection: expect.objectContaining({
        scenario: 'page-edit',
        modelId: 'b-model',
        source: 'explicit',
      }),
    })
  );
});

it('does not silently replace a retired remembered model in another scenario', async () => {
  queryMocks.sendRuntimeMessage.mockImplementation(async (message) =>
    message.operation === 'read-scenario-selection'
      ? {
          success: true,
          scenarioSelection: {
            modelId: 'old',
            modelCode: 'old',
            providerId: 'provider',
            providerIncarnation: 'incarnation',
            displayName: 'Previous model',
            selectedAt: 1,
            source: 'explicit',
          },
        }
      : {
          success: true,
          modelSelection: {
            chromeAiEnabled: false,
            globalSystemPrompt: '',
            models: [
              {
                id: 'replacement',
                modelCode: 'replacement',
                displayName: 'Replacement',
                providerId: 'provider',
              },
            ],
            providers: [
              {
                id: 'provider',
                name: 'Provider',
                incarnation: 'incarnation',
                createdAt: 1,
                hasStoredApiKey: true,
                connectionType: 'neuraldeep',
                destinationKind: 'external',
              },
            ],
          },
        }
  );
  const context = await requestAIScenarioModelSelection('scenario-edit');
  expect(context.resolution).toMatchObject({
    status: 'unavailable',
    modelId: null,
    previousSelection: { displayName: 'Previous model' },
  });
});

it('requests bounded automatic catalog maintenance through an explicit command', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  await refreshManagedAICatalogs();
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledExactlyOnceWith({
    type: MessageType.AI_SETTINGS_MUTATION,
    operation: 'refresh-managed-catalogs',
  });
});
it('reports a refused maintenance command without retrying', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ success: false, error: 'Refused' });
  await expect(refreshManagedAICatalogs()).rejects.toThrow('Refused');
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledTimes(1);
});
