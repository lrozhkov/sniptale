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
