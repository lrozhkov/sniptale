import { beforeEach, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  loadAudioTranscriptionSystemPrompt: vi.fn(),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
  loadChromeAiEnabled: vi.fn(),
  loadDefaultModelId: vi.fn(),
  loadGlobalSystemPrompt: vi.fn(),
  loadScenarioEditorSystemPrompt: vi.fn(),
}));

vi.mock('./core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core')>()),
  ...coreMocks,
}));

import { loadAISettings } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  coreMocks.loadAudioTranscriptionSystemPrompt.mockResolvedValue('Transcription prompt');
  coreMocks.loadAIProviders.mockResolvedValue([{ id: 'provider-1' }]);
  coreMocks.loadAIModels.mockResolvedValue([{ id: 'model-1' }]);
  coreMocks.loadDefaultModelId.mockResolvedValue('model-1');
  coreMocks.loadGlobalSystemPrompt.mockResolvedValue('Global prompt');
  coreMocks.loadScenarioEditorSystemPrompt.mockResolvedValue('Scenario prompt');
  coreMocks.loadChromeAiEnabled.mockResolvedValue(true);
});

it('aggregates every stored AI settings field without mutating storage', async () => {
  await expect(loadAISettings()).resolves.toEqual({
    audioTranscriptionSystemPrompt: 'Transcription prompt',
    chromeAiEnabled: true,
    defaultModelId: 'model-1',
    globalSystemPrompt: 'Global prompt',
    models: [{ id: 'model-1' }],
    providers: [{ id: 'provider-1' }],
    scenarioEditorSystemPrompt: 'Scenario prompt',
  });
  for (const loader of Object.values(coreMocks)) {
    expect(loader).toHaveBeenCalledOnce();
  }
});
