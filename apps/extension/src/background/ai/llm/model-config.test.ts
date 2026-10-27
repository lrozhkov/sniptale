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

import { assertResolvedLlmModelConfigCurrent, resolveModelConfig } from './model-config';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';

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
    connectionType: 'openai-compatible' as const,
    destinationBinding: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    effectiveSystemPrompt: 'Global prompt',
  });

  await expect(resolveModelConfig('model-2')).resolves.toEqual({
    providerId: 'provider-1',
    modelId: 'model-2',
    baseUrl: 'https://provider-1.example.com',
    apiKey: 'provider-1-secret',
    modelCode: 'model-2-code',
    connectionType: 'openai-compatible' as const,
    destinationBinding: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
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
    connectionType: 'openai-compatible' as const,
    destinationBinding: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
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

it('compares the disclosed provider, destination and model before permission or secret activation', async () => {
  resetResolveModelConfigMocks();
  mockResolvedModelConfigState();
  const permissions = vi.fn(async () => true);
  vi.stubGlobal('chrome', { permissions: { contains: permissions } });
  try {
    const approved = {
      approvedProviderId: 'provider-1',
      approvedModelCode: 'model-1-code',
      approvedDestination: await createAIProviderDestinationBinding(createProvider()),
      signal: new AbortController().signal,
    };
    for (const patch of [
      { approvedProviderId: 'other' },
      { approvedModelCode: 'other' },
      { approvedDestination: `sha256:${'0'.repeat(64)}` },
    ]) {
      await expect(resolveModelConfig('model-1', { ...approved, ...patch })).rejects.toThrow(
        'model-unavailable'
      );
      expect(permissions).not.toHaveBeenCalled();
      expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
    }
    await expect(resolveModelConfig('model-1', approved)).resolves.toMatchObject({
      providerId: 'provider-1',
    });
    activateStoredAIProviderSecretForUseMock.mockClear();
    permissions.mockClear();
    loadAIProvidersMock.mockResolvedValue([createProvider('https://changed.test')]);
    await expect(resolveModelConfig('model-1', approved)).rejects.toThrow('model-unavailable');
    expect(permissions).not.toHaveBeenCalled();
    expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('refuses denied or cancelled permission admission before activating credentials', async () => {
  resetResolveModelConfigMocks();
  mockResolvedModelConfigState();
  const permissions = vi.fn(async () => false);
  vi.stubGlobal('chrome', { permissions: { contains: permissions } });
  try {
    const controller = new AbortController();
    const approved = {
      approvedProviderId: 'provider-1',
      approvedModelCode: 'model-1-code',
      approvedDestination: await createAIProviderDestinationBinding(createProvider()),
      signal: controller.signal,
    };
    await expect(resolveModelConfig('model-1', approved)).rejects.toThrow('permission-denied');
    expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
    permissions.mockImplementationOnce(async () => {
      controller.abort();
      return true;
    });
    await expect(resolveModelConfig('model-1', approved)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects audio model IDs before activating credentials for a text request', async () => {
  resetResolveModelConfigMocks();
  mockResolvedModelConfigState();
  loadAIModelsMock.mockResolvedValue([
    {
      ...createModel('audio'),
      operation: 'speech',
      audio: { speech: { voiceId: 'voice', responseFormat: 'mp3' } },
    },
  ]);
  await expect(resolveModelConfig('audio')).rejects.toThrow('does not support text');
  expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
});

describe('native model admission', () => {
  beforeEach(resetResolveModelConfigMocks);

  it('retains native provider kind and honors the catalog output budget', async () => {
    mockResolvedModelConfigState();
    loadAIProvidersMock.mockResolvedValue([
      { ...createProvider(), connectionType: 'google', management: 'automatic', enabled: true },
    ]);
    loadAIModelsMock.mockResolvedValue([
      {
        ...createModel('native'),
        source: 'catalog',
        capabilities: {
          operations: { text: 'supported', transcription: 'supported' },
          input: { text: 'supported' },
          output: { text: 'supported' },
          features: {},
          maxOutputTokens: 1024,
        },
      },
    ]);
    await expect(resolveModelConfig('native')).resolves.toMatchObject({
      connectionType: 'google',
      maxOutputTokens: 1024,
    });
  });

  it('resolves a local provider without activating absent cloud credentials', async () => {
    mockResolvedModelConfigState();
    loadAIProvidersMock.mockResolvedValue([
      {
        ...createProvider('http://localhost:11434/api'),
        connectionType: 'ollama',
        hasStoredApiKey: false,
      },
    ]);
    await expect(resolveModelConfig('model-1')).resolves.toMatchObject({
      connectionType: 'ollama',
      apiKey: '',
    });
    expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'manual-managed-record', 'unsupported-adapter', 'retired'] as const)(
    'rejects %s before secret activation',
    async (condition) => {
      mockResolvedModelConfigState();
      const provider = {
        ...createProvider(),
        ...(condition === 'disabled' ? { enabled: false } : {}),
        ...(condition === 'unsupported-adapter' ? { connectionType: 'elevenlabs' as const } : {}),
        management: 'manual',
      };
      loadAIProvidersMock.mockResolvedValue([provider]);
      if (condition === 'manual-managed-record')
        loadAIModelsMock.mockResolvedValue([{ ...createModel('model-1'), source: 'catalog' }]);
      if (condition === 'retired')
        loadAIModelsMock.mockResolvedValue([
          {
            ...createModel('model-1'),
            catalog: {
              lifecycle: 'retired',
              displayName: 'Retired',
              observedAt: 1,
              capabilities: { operations: {}, input: {}, output: {}, features: {} },
            },
          },
        ]);
      await expect(resolveModelConfig('model-1')).rejects.toThrow('does not support text');
      expect(activateStoredAIProviderSecretForUseMock).not.toHaveBeenCalled();
    }
  );
});

it('refuses a recreated provider or revoked host grant after resolving the request snapshot', async () => {
  resetResolveModelConfigMocks();
  mockResolvedModelConfigState();
  const config = await resolveModelConfig('model-1');
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => false) } });
  try {
    await expect(assertResolvedLlmModelConfigCurrent(config)).rejects.toThrow('permission-denied');
    loadAIProvidersMock.mockResolvedValue([{ ...createProvider(), incarnation: 'replacement' }]);
    await expect(assertResolvedLlmModelConfigCurrent(config)).rejects.toThrow('model-unavailable');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('captures stable non-secret observation authority and invalidates it after credential rotation', async () => {
  mockResolvedModelConfigState();
  const provider = {
    ...createProvider(),
    incarnation: 'incarnation',
    revision: 3,
    credentialRevision: 4,
  };
  loadAIProvidersMock.mockResolvedValue([provider]);
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) } });
  const first = await resolveModelConfig('model-1');
  expect(first.observationBinding).toEqual({
    model: { id: 'model-1', code: 'model-1-code', operation: 'text' },
    providerId: provider.id,
    incarnation: 'incarnation',
    revision: 3,
    credentialRevision: 4,
    destination: first.destinationBinding,
  });
  expect(JSON.stringify(first.observationBinding)).not.toContain('secret');
  expect(await resolveModelConfig('model-1')).toEqual(first);
  await expect(assertResolvedLlmModelConfigCurrent(first)).resolves.toBeUndefined();
  loadAIProvidersMock.mockResolvedValue([{ ...provider, credentialRevision: 5 }]);
  await expect(assertResolvedLlmModelConfigCurrent(first)).rejects.toThrow('model-unavailable');
});
