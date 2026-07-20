import { beforeEach, expect, it, vi } from 'vitest';

const {
  loadChromeAiAvailabilityMock,
  loadChromeAiEnabledMock,
  initializeAiStorageAccessMock,
  loadAIModelsMock,
  loadAIProvidersMock,
  loadDefaultModelIdMock,
  loadGlobalSystemPromptMock,
} = vi.hoisted(() => ({
  loadChromeAiAvailabilityMock: vi.fn(),
  loadChromeAiEnabledMock: vi.fn(),
  initializeAiStorageAccessMock: vi.fn(),
  loadAIModelsMock: vi.fn(),
  loadAIProvidersMock: vi.fn(),
  loadDefaultModelIdMock: vi.fn(),
  loadGlobalSystemPromptMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/chrome-ai', () => ({
  ChromeAiAvailability: undefined,
  ChromeAiCapability: undefined,
  ChromeAiRuntimeErrorReason: undefined,
  ChromeAiRuntimeError: class ChromeAiRuntimeError extends Error {
    readonly reason: 'unexpected' | 'unsupported';

    constructor(reason: 'unexpected' | 'unsupported') {
      super(`chrome-ai:${reason}`);
      this.reason = reason;
    }
  },
  createChromeAiSession: vi.fn(),
  createChromeAiSystemPromptMessage: vi.fn(),
  loadChromeAiAvailability: loadChromeAiAvailabilityMock,
  prepareChromeAiSession: vi.fn(),
}));

vi.mock('../../composition/persistence/ai-settings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/ai-settings/index')>()),
  loadChromeAiEnabled: loadChromeAiEnabledMock,
  loadAIModels: loadAIModelsMock,
  loadAIProviders: loadAIProvidersMock,
  loadDefaultModelId: loadDefaultModelIdMock,
  loadGlobalSystemPrompt: loadGlobalSystemPromptMock,
  initializeAiStorageAccess: initializeAiStorageAccessMock,
}));

import { loadAIModelSelectionBootstrap } from './model-selection-bootstrap';

beforeEach(() => {
  vi.clearAllMocks();
  loadAIModelsMock.mockResolvedValue([
    {
      id: 'model-1',
      providerId: 'provider-1',
      modelCode: 'gpt-4.1',
      displayName: 'GPT 4.1',
      systemPrompt: '',
    },
  ]);
  loadAIProvidersMock.mockResolvedValue([
    {
      id: 'provider-1',
      name: 'OpenAI',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      hasStoredApiKey: true,
      createdAt: 1,
    },
  ]);
  loadDefaultModelIdMock.mockResolvedValue('model-1');
  loadGlobalSystemPromptMock.mockResolvedValue('Global system prompt');
  loadChromeAiEnabledMock.mockResolvedValue(false);
  loadChromeAiAvailabilityMock.mockResolvedValue('unsupported');
  initializeAiStorageAccessMock.mockResolvedValue(undefined);
});

it('loads the shared model-selection bootstrap payload', async () => {
  await expect(loadAIModelSelectionBootstrap()).resolves.toEqual({
    chromeAiEnabled: false,
    defaultModelId: 'model-1',
    globalSystemPrompt: 'Global system prompt',
    models: [
      expect.objectContaining({
        id: 'model-1',
        displayName: 'GPT 4.1',
      }),
    ],
    providers: [
      expect.objectContaining({
        id: 'provider-1',
        name: 'OpenAI',
      }),
    ],
  });
  expect(initializeAiStorageAccessMock).toHaveBeenCalledTimes(1);
});

it('injects the virtual Chrome AI option only when the feature is enabled and available', async () => {
  loadChromeAiEnabledMock.mockResolvedValueOnce(true);
  loadChromeAiAvailabilityMock.mockResolvedValueOnce('available');

  await expect(loadAIModelSelectionBootstrap()).resolves.toEqual(
    expect.objectContaining({
      chromeAiEnabled: true,
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'model-1' }),
        expect.objectContaining({ id: 'chrome-ai-google-model' }),
      ]),
      providers: expect.arrayContaining([
        expect.objectContaining({ id: 'provider-1' }),
        expect.objectContaining({ id: 'chrome-ai-google-provider' }),
      ]),
    })
  );
});

it('resolves a stale Chrome AI default without write-on-read repair', async () => {
  loadChromeAiEnabledMock.mockResolvedValueOnce(true);
  loadChromeAiAvailabilityMock.mockResolvedValueOnce('unavailable');
  loadDefaultModelIdMock.mockResolvedValueOnce('chrome-ai-google-model');

  await expect(loadAIModelSelectionBootstrap()).resolves.toEqual(
    expect.objectContaining({
      defaultModelId: 'model-1',
    })
  );
});
