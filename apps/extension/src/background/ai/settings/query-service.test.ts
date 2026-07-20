import { beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  initializeAiStorageAccess: vi.fn(),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
  loadAISecretProtectionStatus: vi.fn(),
  loadChromeAiEnabled: vi.fn(),
  loadDefaultModelId: vi.fn(),
  loadGlobalSystemPrompt: vi.fn(),
  loadScenarioEditorSystemPrompt: vi.fn(),
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),
  initializeAiStorageAccess: storageMocks.initializeAiStorageAccess,
  loadAIModels: storageMocks.loadAIModels,
  loadAIProviders: storageMocks.loadAIProviders,
  loadAISecretProtectionStatus: storageMocks.loadAISecretProtectionStatus,
  loadChromeAiEnabled: storageMocks.loadChromeAiEnabled,
  loadDefaultModelId: storageMocks.loadDefaultModelId,
  loadGlobalSystemPrompt: storageMocks.loadGlobalSystemPrompt,
  loadScenarioEditorSystemPrompt: storageMocks.loadScenarioEditorSystemPrompt,
}));

import { resolveAISettingsQueryResponse } from './query-service';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.initializeAiStorageAccess.mockResolvedValue(undefined);
  storageMocks.loadAIModels.mockResolvedValue([
    {
      displayName: 'Model',
      id: 'model-1',
      modelCode: 'model-code',
      providerId: 'provider-1',
      systemPrompt: 'Model prompt',
    },
  ]);
  storageMocks.loadAIProviders.mockResolvedValue([
    {
      baseUrl: 'https://api.provider.test/v1',
      connectionType: 'openai-compatible',
      createdAt: 1,
      hasStoredApiKey: true,
      id: 'provider-1',
      name: 'Provider',
    },
  ]);
  storageMocks.loadChromeAiEnabled.mockResolvedValue(false);
  storageMocks.loadDefaultModelId.mockResolvedValue('model-1');
  storageMocks.loadGlobalSystemPrompt.mockResolvedValue('Global prompt');
  storageMocks.loadScenarioEditorSystemPrompt.mockResolvedValue('Scenario prompt');
  storageMocks.loadAISecretProtectionStatus.mockResolvedValue({
    isEnabled: false,
    isUnlocked: true,
    mode: 'transparent',
  });
});

it('returns sanitized model selection bootstrap without provider base URLs', async () => {
  await expect(
    resolveAISettingsQueryResponse({
      operation: 'read-model-selection-bootstrap',
      type: MessageType.AI_SETTINGS_QUERY,
    })
  ).resolves.toEqual({
    modelSelection: {
      chromeAiEnabled: false,
      defaultModelId: 'model-1',
      globalSystemPrompt: 'Global prompt',
      models: [
        expect.objectContaining({
          id: 'model-1',
          systemPrompt: 'Model prompt',
        }),
      ],
      providers: [
        {
          connectionType: 'openai-compatible',
          createdAt: 1,
          destinationKind: 'external',
          hasStoredApiKey: true,
          id: 'provider-1',
          name: 'Provider',
        },
      ],
    },
    success: true,
  });
});

it('keeps full provider metadata only in settings page runtime data', async () => {
  const response = await resolveAISettingsQueryResponse({
    operation: 'read-settings-page-runtime-data',
    type: MessageType.AI_SETTINGS_QUERY,
  });

  expect(response.settingsRuntimeData?.selectionBootstrap.providers[0]).toMatchObject({
    baseUrl: 'https://api.provider.test/v1',
    id: 'provider-1',
  });
  expect(response.settingsRuntimeData?.scenarioEditorSystemPrompt).toBe('Scenario prompt');
  expect(response.settingsRuntimeData?.secretProtectionStatus).toEqual({
    isEnabled: false,
    isUnlocked: true,
    mode: 'transparent',
  });
});

it('resolves Chrome AI content prompts without returning model/provider collections', async () => {
  await expect(
    resolveAISettingsQueryResponse({
      modelId: 'model-1',
      operation: 'read-chrome-ai-content-system-prompt',
      type: MessageType.AI_SETTINGS_QUERY,
    })
  ).resolves.toEqual({
    success: true,
    systemPrompt: 'Model prompt',
  });
});

it('falls back to the global prompt when the selected Chrome AI model has no prompt', async () => {
  storageMocks.loadAIModels.mockResolvedValueOnce([
    {
      displayName: 'Model',
      id: 'model-1',
      modelCode: 'model-code',
      providerId: 'provider-1',
      systemPrompt: '   ',
    },
  ]);

  await expect(
    resolveAISettingsQueryResponse({
      modelId: 'model-1',
      operation: 'read-chrome-ai-content-system-prompt',
      type: MessageType.AI_SETTINGS_QUERY,
    })
  ).resolves.toEqual({
    success: true,
    systemPrompt: 'Global prompt',
  });
});

it('classifies provider destinations without exposing provider URLs in selector bootstrap', async () => {
  storageMocks.loadAIProviders.mockResolvedValueOnce([
    {
      baseUrl: 'chrome://optimization-guide',
      connectionType: 'chrome-built-in',
      createdAt: 1,
      hasStoredApiKey: false,
      id: 'chrome',
      name: 'Chrome AI',
    },
    {
      baseUrl: 'http://127.0.0.1:11434/v1',
      connectionType: 'openai-compatible',
      createdAt: 2,
      hasStoredApiKey: false,
      id: 'local',
      name: 'Local',
    },
    {
      baseUrl: 'not a url',
      connectionType: 'openai-compatible',
      createdAt: 3,
      hasStoredApiKey: false,
      id: 'malformed',
      name: 'Malformed',
    },
  ]);

  const response = await resolveAISettingsQueryResponse({
    operation: 'read-model-selection-bootstrap',
    type: MessageType.AI_SETTINGS_QUERY,
  });

  expect(response.modelSelection?.providers).toEqual([
    expect.objectContaining({ destinationKind: 'chrome-built-in', id: 'chrome' }),
    expect.objectContaining({ destinationKind: 'local-custom', id: 'local' }),
    expect.objectContaining({ destinationKind: 'external', id: 'malformed' }),
  ]);
  expect(response.modelSelection?.providers).toEqual(
    expect.not.arrayContaining([expect.objectContaining({ baseUrl: expect.any(String) })])
  );
});

it('returns the scenario editor prompt through the read-only query route', async () => {
  await expect(
    resolveAISettingsQueryResponse({
      operation: 'read-scenario-editor-system-prompt',
      type: MessageType.AI_SETTINGS_QUERY,
    })
  ).resolves.toEqual({
    scenarioEditorSystemPrompt: 'Scenario prompt',
    success: true,
  });
});
