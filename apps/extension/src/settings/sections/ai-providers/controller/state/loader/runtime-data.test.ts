import { beforeEach, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  requestAISettingsPageRuntimeDataMock: vi.fn(),
}));

vi.mock('../../../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../workflows/ai-settings/query')>()),
  requestAISettingsPageRuntimeData: loaderMocks.requestAISettingsPageRuntimeDataMock,
}));

import type { AIModel, AIProvider } from '../../../../../../contracts/settings';
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

it('loads ai providers runtime data in one batch and preserves order', async () => {
  loaderMocks.requestAISettingsPageRuntimeDataMock.mockResolvedValue({
    scenarioEditorSystemPrompt: 'Scenario prompt',
    secretProtectionStatus: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    selectionBootstrap: {
      chromeAiEnabled: true,
      defaultModelId: 'chrome-ai-google-model',
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
    'chrome-ai-google-model',
    'Shared prompt',
    'Scenario prompt',
    true,
    { isEnabled: false, isUnlocked: true, mode: 'transparent' },
  ]);
  expect(loaderMocks.requestAISettingsPageRuntimeDataMock).toHaveBeenCalledTimes(1);
});
