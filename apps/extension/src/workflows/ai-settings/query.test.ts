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
  requestAIModelSelectionBootstrap,
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

it('requests sanitized model selection bootstrap through runtime messaging', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    modelSelection: {
      chromeAiEnabled: false,
      defaultModelId: 'model-1',
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
    success: true,
  });

  await expect(requestAIModelSelectionBootstrap()).resolves.toMatchObject({
    defaultModelId: 'model-1',
    providers: [expect.not.objectContaining({ baseUrl: expect.any(String) })],
  });
  expect(queryMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    operation: 'read-model-selection-bootstrap',
    type: MessageType.AI_SETTINGS_QUERY,
  });
});

it('adds Chrome AI selector entries locally when the page runtime reports availability', async () => {
  queryMocks.loadChromeAiAvailability.mockResolvedValue('available');
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    modelSelection: {
      chromeAiEnabled: true,
      defaultModelId: null,
      globalSystemPrompt: '',
      models: [],
      providers: [],
    },
    success: true,
  });

  await expect(requestAIModelSelectionBootstrap()).resolves.toMatchObject({
    models: [expect.objectContaining({ id: CHROME_AI_MODEL_ID })],
    providers: [expect.objectContaining({ destinationKind: 'chrome-built-in' })],
  });
});

it('drops an unavailable Chrome AI default model from selector bootstrap', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    modelSelection: {
      chromeAiEnabled: true,
      defaultModelId: CHROME_AI_MODEL_ID,
      globalSystemPrompt: '',
      models: [{ displayName: 'Fallback', id: 'fallback', modelCode: 'fallback', providerId: 'p' }],
      providers: [
        {
          connectionType: 'openai-compatible',
          createdAt: 1,
          destinationKind: 'external',
          hasStoredApiKey: false,
          id: 'p',
          name: 'Provider',
        },
      ],
    },
    success: true,
  });

  await expect(requestAIModelSelectionBootstrap()).resolves.toMatchObject({
    defaultModelId: 'fallback',
  });
});

it('throws when the background query returns an error response', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ error: 'denied', success: false });

  await expect(requestAIModelSelectionBootstrap()).rejects.toThrow('denied');
});

it('throws when model selection bootstrap response omits its payload', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({ success: true });

  await expect(requestAIModelSelectionBootstrap()).rejects.toThrow(
    'AI model selection bootstrap response missing payload'
  );
});

it('keeps full provider metadata scoped to settings page runtime data', async () => {
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    settingsRuntimeData: {
      scenarioEditorSystemPrompt: 'Scenario prompt',
      secretProtectionStatus: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
      selectionBootstrap: {
        chromeAiEnabled: false,
        defaultModelId: null,
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

it('filters text and audio selectors before presentation and never adds Chrome AI to audio', async () => {
  const text = { id: 'text', providerId: 'p', modelCode: 'same', displayName: 'Text' };
  const speech = {
    ...text,
    id: 'speech',
    operation: 'speech',
    audio: { speech: { voiceId: 'custom', responseFormat: 'mp3' } },
  };
  queryMocks.loadChromeAiAvailability.mockResolvedValue('available');
  queryMocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    modelSelection: {
      chromeAiEnabled: true,
      defaultModelId: 'text',
      globalSystemPrompt: 'Global',
      providers: [],
      models: [text, speech],
    },
  });
  expect((await requestAIModelSelectionBootstrap()).models.map((model) => model.id)).not.toContain(
    'speech'
  );
  await expect(requestAIModelSelectionBootstrap('speech')).resolves.toMatchObject({
    models: [speech],
    defaultModelId: 'speech',
  });
  await expect(requestAIModelSelectionBootstrap('transcription')).resolves.toMatchObject({
    models: [],
    defaultModelId: null,
  });
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
            defaultModelId: 'b-model',
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
            defaultModelId: 'replacement',
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
