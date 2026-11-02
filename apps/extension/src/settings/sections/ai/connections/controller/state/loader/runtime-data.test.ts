import { beforeEach, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  requestAISettingsPageRuntimeDataMock: vi.fn(),
}));

vi.mock('../../../../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../../workflows/ai-settings/query')>()),
  requestAISettingsPageRuntimeData: loaderMocks.requestAISettingsPageRuntimeDataMock,
}));

import type { AIModel, AIProvider } from '../../../../../../../contracts/settings';
import { loadAiProvidersRuntimeData } from './runtime-data';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'Ollama local',
  connectionType: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODELS: AIModel[] = [
  {
    id: 'model-1',
    providerId: 'provider-1',
    modelCode: 'llama3.2',
    displayName: 'Llama 3.2',
    systemPrompt: '',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

it('loads AI catalog data in one batch without taking ownership of shared protection status', async () => {
  loaderMocks.requestAISettingsPageRuntimeDataMock.mockResolvedValue({
    scenarioEditorSystemPrompt: 'Scenario prompt',
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
      participants: { ai: false, webdav: true },
    },
    selectionBootstrap: {
      chromeAiEnabled: true,
      globalSystemPrompt: 'Shared prompt',
      models: [
        ...MODELS,
        { id: 'chrome-ai-google-model', providerId: 'chrome-ai-google-provider' },
      ],
      providers: [...[PROVIDER], { id: 'chrome-ai-google-provider', name: 'Google' }],
    },
  });

  await expect(loadAiProvidersRuntimeData()).resolves.toEqual([
    [PROVIDER],
    MODELS,
    [PROVIDER, { id: 'chrome-ai-google-provider', name: 'Google' }],
    [...MODELS, { id: 'chrome-ai-google-model', providerId: 'chrome-ai-google-provider' }],
    'Shared prompt',
    'Scenario prompt',
    true,
  ]);
  expect(loaderMocks.requestAISettingsPageRuntimeDataMock).toHaveBeenCalledTimes(1);
});
