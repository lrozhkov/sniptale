import {
  initializeAiStorageAccess,
  loadAIModels,
  loadAIProviders,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import { resolveAIProviderAudioUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import {
  isValidAIModelOperationConfiguration,
  type AISpeechModelParameters,
  type AITranscriptionModelParameters,
} from '../../../contracts/settings/model-operation';
import type { AudioJobStart } from '../../../contracts/ai/audio';

export interface AudioModelConfig {
  url: string;
  apiKey: string;
  modelCode: string;
  transcription?: AITranscriptionModelParameters;
  speech?: AISpeechModelParameters;
}

export async function resolveAudioModelConfig(request: AudioJobStart): Promise<AudioModelConfig> {
  await initializeAiStorageAccess();
  const [models, providers] = await Promise.all([loadAIModels(), loadAIProviders()]);
  const model = models.find((entry) => entry.id === request.modelId);
  if (
    !model ||
    model.operation !== request.operation ||
    !isValidAIModelOperationConfiguration(model)
  )
    throw new Error('model-unavailable');
  const provider = providers.find((entry) => entry.id === model.providerId);
  const url = provider && resolveAIProviderAudioUrl(provider.baseUrl, request.operation);
  if (!provider || !url || !provider.hasStoredApiKey) throw new Error('model-unavailable');
  if (!(await chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] })))
    throw new Error('permission-denied');
  const apiKey = await activateStoredAIProviderSecretForUse(provider);
  if (!apiKey) throw new Error('secret-unavailable');
  return {
    url,
    apiKey,
    modelCode: model.modelCode,
    ...(request.operation === 'transcription' && model.audio?.transcription
      ? { transcription: model.audio.transcription }
      : {}),
    ...(request.operation === 'speech' ? { speech: request.profile } : {}),
  };
}
