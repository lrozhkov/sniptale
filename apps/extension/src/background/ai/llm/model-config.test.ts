import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';

const {
  initializeAiStorageAccessMock,
  loadAIModelsMock,
  loadAIProvidersMock,
  loadGlobalSystemPromptMock,
  activateStoredAIProviderSecretForUseMock,
} = vi.hoisted(() => ({
  initializeAiStorageAccessMock: vi.fn(),
  loadAIModelsMock: vi.fn(),
  loadAIProvidersMock: vi.fn(),
  loadGlobalSystemPromptMock: vi.fn(),
  activateStoredAIProviderSecretForUseMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),

  initializeAiStorageAccess: initializeAiStorageAccessMock,
  loadAIModels: loadAIModelsMock,
  loadAIProviders: loadAIProvidersMock,
  loadGlobalSystemPrompt: loadGlobalSystemPromptMock,
}));

vi.mock(
  '../../../composition/persistence/ai-settings/provider-secrets.store.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/ai-settings/provider-secrets.store.ts')
    >()),
    activateStoredAIProviderSecretForUse: activateStoredAIProviderSecretForUseMock,
  })
);

import { resolveModelConfig } from './model-config';

function createProvider(baseUrl = 'https://provider-1.example.com') {
  return {
    id: 'provider-1',
    name: 'Provider provider-1',
    connectionType: 'openai-compatible' as const,
    baseUrl,
    hasStoredApiKey: true,
    createdAt: 1,
  };
}

function createModel(id: string, providerId = 'provider-1') {
  return {
    id,
    providerId,
    displayName: `Model ${id}`,
    modelCode: `${id}-code`,
  };
}

function mockResolvedModelConfigState() {
  loadAIProvidersMock.mockResolvedValue([createProvider()]);
  loadAIModelsMock.mockResolvedValue([
    createModel('model-1'),
    {
      ...createModel('model-2'),
      systemPrompt: '  Model prompt  ',
    },
    createModel('model-orphan', 'provider-missing'),
  ]);
  loadGlobalSystemPromptMock.mockResolvedValue('Global prompt');
  activateStoredAIProviderSecretForUseMock.mockResolvedValue('provider-1-secret');
}

function resetResolveModelConfigMocks() {
  vi.clearAllMocks();
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
}

async function verifyResolvedModelConfigSuccessCases() {
  mockResolvedModelConfigState();

  await expect(resolveModelConfig('model-1')).resolves.toEqual({
    providerId: 'provider-1',
    modelId: 'model-1',
    baseUrl: 'https://provider-1.example.com',
    apiKey: 'provider-1-secret',
    modelCode: 'model-1-code',
    effectiveSystemPrompt: 'Global prompt',
  });

  await expect(resolveModelConfig('model-2')).resolves.toEqual({
    providerId: 'provider-1',
    modelId: 'model-2',
    baseUrl: 'https://provider-1.example.com',
    apiKey: 'provider-1-secret',
    modelCode: 'model-2-code',
    effectiveSystemPrompt: 'Model prompt',
  });
}

async function verifyResolvedModelConfigMissingOwnerErrors() {
  mockResolvedModelConfigState();

  await expect(resolveModelConfig('model-missing')).rejects.toThrow(
    'Model model-missing not found'
  );
  await expect(resolveModelConfig('model-orphan')).rejects.toThrow(
    'Provider provider-missing not found for model model-orphan'
  );
}

async function verifyResolvedModelConfigSecretAndPolicyErrors() {
  mockResolvedModelConfigState();

  loadAIProvidersMock.mockResolvedValue([{ ...createProvider(), hasStoredApiKey: false }]);
  await expect(resolveModelConfig('model-1')).rejects.toThrow(
    translate('background.runtime.llmProviderApiKeyReentryRequired')
  );

  loadAIProvidersMock.mockResolvedValue([createProvider()]);
  activateStoredAIProviderSecretForUseMock.mockResolvedValue(null);
  await expect(resolveModelConfig('model-1')).rejects.toThrow(
    translate('background.runtime.llmProviderApiKeyReentryRequired')
  );

  loadAIProvidersMock.mockResolvedValue([createProvider('http://api.example.com/v1')]);
  activateStoredAIProviderSecretForUseMock.mockResolvedValue('provider-1-secret');
  await expect(resolveModelConfig('model-1')).rejects.toThrow(
    translate('background.runtime.llmProviderBaseUrlHttpsRequired')
  );

  loadAIProvidersMock.mockResolvedValue([createProvider('https://api.example.com/v1?token=1')]);
  await expect(resolveModelConfig('model-1')).rejects.toThrow(
    translate('background.runtime.llmProviderBaseUrlHttpsRequired')
  );

  loadAIProvidersMock.mockResolvedValue([createProvider('http://127.0.0.1:11434/v1')]);
  await expect(resolveModelConfig('model-1')).resolves.toEqual({
    providerId: 'provider-1',
    modelId: 'model-1',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'provider-1-secret',
    modelCode: 'model-1-code',
    effectiveSystemPrompt: 'Global prompt',
  });
}

async function verifySecretResolutionUsesExactProviderBinding() {
  mockResolvedModelConfigState();
  activateStoredAIProviderSecretForUseMock.mockImplementation(async (provider) =>
    provider.baseUrl === 'https://provider-1.example.com' ? 'provider-1-secret' : null
  );

  await expect(resolveModelConfig('model-1')).resolves.toMatchObject({
    apiKey: 'provider-1-secret',
  });
  expect(activateStoredAIProviderSecretForUseMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: 'https://provider-1.example.com',
      id: 'provider-1',
    })
  );

  loadAIProvidersMock.mockResolvedValue([createProvider('https://other.example.com/v1')]);
  await expect(resolveModelConfig('model-1')).rejects.toThrow(
    translate('background.runtime.llmProviderApiKeyReentryRequired')
  );
}

describe('background/llm/model-config', () => {
  beforeEach(resetResolveModelConfigMocks);

  it('resolves provider-backed model config with prompt precedence and validation errors', async () => {
    await verifyResolvedModelConfigSuccessCases();
    await verifyResolvedModelConfigMissingOwnerErrors();
    await verifyResolvedModelConfigSecretAndPolicyErrors();
    await verifySecretResolutionUsesExactProviderBinding();
  });
});
