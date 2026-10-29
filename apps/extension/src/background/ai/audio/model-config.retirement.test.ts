import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeAiStorageAccess,
  loadAudioTranscriptionSystemPrompt,
  loadAIModels,
  loadAIProviders,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import type { AudioJobStart } from '../../../contracts/ai/audio';
import { resolveAudioModelConfig } from './model-config';

vi.mock('../../../composition/persistence/ai-settings', () => ({
  initializeAiStorageAccess: vi.fn(),
  loadAudioTranscriptionSystemPrompt: vi.fn(),
  loadAIModels: vi.fn(),
  loadAIProviders: vi.fn(),
}));
vi.mock('../../../composition/persistence/ai-settings/provider-secrets.store', () => ({
  activateStoredAIProviderSecretForUse: vi.fn(),
}));
const permission = vi.fn(async () => true);
const provider: AIProvider = {
  id: 'provider',
  name: 'Connection',
  connectionType: 'openai-compatible',
  baseUrl: 'https://audio.example.test/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};
const authoredRequest: AudioJobStart = {
  type: 'start',
  requestId: 'request',
  modelId: 'model',
  operation: 'speech',
  approvedProviderId: provider.id,
  scope: {
    workspaceId: 'workspace',
    workspaceRevision: 1,
    target: { kind: 'text', fragmentId: 'phrase' },
    textRevision: 1,
    timingRevision: 0,
    start: 0,
    end: 1,
    timeDomain: 'result',
  },
  phraseId: 'phrase',
  textRevision: 1,
  text: 'Saved phrase',
  profile: { voiceId: 'selected', responseFormat: 'mp3' },
};
function managedAudioModel(): AIModel {
  return {
    id: 'model',
    providerId: provider.id,
    modelCode: 'speech-model',
    displayName: 'Speech',
    source: 'catalog',
    capabilities: {
      operations: { speech: 'supported' },
      input: { text: 'supported' },
      output: { audio: 'supported' },
      features: {},
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', { permissions: { contains: permission } });
  permission.mockResolvedValue(true);
  vi.mocked(initializeAiStorageAccess).mockResolvedValue(undefined);
  vi.mocked(loadAudioTranscriptionSystemPrompt).mockResolvedValue('Audio instructions');
  vi.mocked(activateStoredAIProviderSecretForUse).mockResolvedValue('fixture-secret');
});
afterEach(() => vi.unstubAllGlobals());

it.each([0, 1])(
  'revalidates cached audio retirement before secret activation at deadline offset %s',
  async (offset) => {
    const retirementAt = Date.parse('2030-01-01T00:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(retirementAt - 1);
    const candidate = managedAudioModel();
    candidate.catalog = {
      displayName: 'Scheduled',
      capabilities: candidate.capabilities!,
      lifecycle: 'deprecated',
      observedAt: 1,
      retirementAt,
    };
    vi.mocked(loadAIModels).mockResolvedValue([candidate]);
    vi.mocked(loadAIProviders).mockResolvedValue([{ ...provider, management: 'automatic' }]);
    try {
      await expect(resolveAudioModelConfig(authoredRequest)).resolves.toMatchObject({
        modelCode: candidate.modelCode,
      });
      vi.mocked(activateStoredAIProviderSecretForUse).mockClear();
      permission.mockClear();
      clock.mockReturnValue(retirementAt + offset);
      await expect(resolveAudioModelConfig(authoredRequest)).rejects.toThrow('model-unavailable');
      expect(permission).not.toHaveBeenCalled();
      expect(activateStoredAIProviderSecretForUse).not.toHaveBeenCalled();
      candidate.source = 'manual';
      candidate.propertySource = 'manual';
      candidate.retirementOverride = true;
      await expect(resolveAudioModelConfig(authoredRequest)).resolves.toMatchObject({
        modelCode: candidate.modelCode,
      });
    } finally {
      clock.mockRestore();
    }
  }
);
