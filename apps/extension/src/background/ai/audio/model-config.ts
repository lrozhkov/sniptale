import {
  getAIProviderDefinition,
  getAIProviderOperations,
  type AIProviderType,
} from '../../../contracts/settings/ai-provider';
import { supportsAIModelOperation } from '../../../contracts/settings/model-operation';
import {
  initializeAiStorageAccess,
  loadAIModels,
  loadAIProviders,
  loadAudioTranscriptionSystemPrompt,
} from '../../../composition/persistence/ai-settings';
import { activateStoredAIProviderSecretForUse } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import {
  resolveAIProviderChatCompletionsUrl,
  resolveAIProviderAudioUrl,
} from '@sniptale/runtime-contracts/ai/provider-base-url-policy';
import type { VoiceProviderSelection } from '@sniptale/runtime-contracts/voice-input';
import {
  isValidAIModelOperationConfiguration,
  type AISpeechModelParameters,
  type AITranscriptionModelParameters,
} from '../../../contracts/settings/model-operation';
import { isAudioSourceJobScope, type AudioJobStart } from '../../../contracts/ai/audio';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';

export interface AudioModelConfig {
  connectionType: AIProviderType;
  baseUrl: string;
  url: string;
  apiKey: string;
  modelCode: string;
  transcriptionInstructions?: string;
  transcription?: AITranscriptionModelParameters;
  speech?: AISpeechModelParameters;
}

interface AudioModelSelection {
  modelId: string;
  operation: 'speech' | 'transcription';
  approvedProviderId?: string;
  approved?: VoiceProviderSelection;
  recognition: boolean | 'automatic';
  profile?: AISpeechModelParameters;
  signal?: AbortSignal;
}

async function resolveSelectedAudioModel(args: AudioModelSelection): Promise<AudioModelConfig> {
  args.signal?.throwIfAborted();
  await initializeAiStorageAccess();
  const [models, providers] = await Promise.all([loadAIModels(), loadAIProviders()]);
  args.signal?.throwIfAborted();
  const model = models.find((entry) => entry.id === args.modelId);
  if (
    !model ||
    !supportsAIModelOperation(model, args.operation) ||
    model.operation !== args.operation ||
    !isValidAIModelOperationConfiguration(model)
  )
    throw new Error('model-unavailable');
  if (args.approvedProviderId !== undefined && args.approvedProviderId !== model.providerId)
    throw new Error('model-unavailable');
  const provider = providers.find((entry) => entry.id === model.providerId);
  if (
    !provider ||
    provider.enabled === false ||
    !getAIProviderOperations(provider.connectionType).includes(args.operation) ||
    (args.operation === 'transcription' && provider.connectionType !== 'openai-compatible')
  )
    throw new Error('model-unavailable');
  const chat =
    args.operation === 'transcription' && model.audio?.transcription?.transport === 'audio-chat';
  if (chat && !args.approvedProviderId) throw new Error('model-unavailable');
  if (
    args.operation === 'transcription' &&
    args.recognition !== 'automatic' &&
    args.recognition !== chat
  )
    throw new Error('invalid-request');
  if (
    args.approved &&
    (!provider ||
      provider.connectionType !== 'openai-compatible' ||
      model.modelCode !== args.approved.approvedModelCode ||
      (await createAIProviderDestinationBinding(provider)) !== args.approved.approvedDestination)
  )
    throw new Error('model-unavailable');
  args.signal?.throwIfAborted();
  const url =
    provider &&
    (chat
      ? resolveAIProviderChatCompletionsUrl(provider.baseUrl)
      : resolveAIProviderAudioUrl(provider.baseUrl, args.operation));
  const requiresSecret = getAIProviderDefinition(provider.connectionType).credential !== 'none';
  if (!url || (requiresSecret && !provider.hasStoredApiKey)) throw new Error('model-unavailable');
  if (!(await chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] })))
    throw new Error('permission-denied');
  args.signal?.throwIfAborted();
  const apiKey = provider.hasStoredApiKey
    ? await activateStoredAIProviderSecretForUse(provider)
    : '';
  args.signal?.throwIfAborted();
  if (apiKey === null || (requiresSecret && !apiKey)) throw new Error('secret-unavailable');
  const instructions = chat ? await loadAudioTranscriptionSystemPrompt() : undefined;
  args.signal?.throwIfAborted();
  return {
    connectionType: provider.connectionType,
    baseUrl: provider.baseUrl,
    url,
    apiKey,
    modelCode: model.modelCode,
    ...(instructions === undefined ? {} : { transcriptionInstructions: instructions }),
    ...(args.operation === 'transcription' && model.audio?.transcription
      ? { transcription: model.audio.transcription }
      : {}),
    ...(args.operation === 'speech' && args.profile ? { speech: args.profile } : {}),
  };
}

/** Resolves editor audio operations after their existing project/source admission. */
export function resolveAudioModelConfig(request: AudioJobStart): Promise<AudioModelConfig> {
  if (!isAudioSourceJobScope(request.scope) && !request.approvedProviderId)
    return Promise.reject(new Error('model-unavailable'));
  return resolveSelectedAudioModel({
    modelId: request.modelId,
    operation: request.operation,
    ...(request.approvedProviderId === undefined
      ? {}
      : { approvedProviderId: request.approvedProviderId }),
    recognition: request.operation === 'transcription' && Boolean(request.recognition),
    ...(request.operation === 'speech' ? { profile: request.profile } : {}),
  });
}

/** Resolves the exact configured voice model and destination without a fabricated project scope. */
export function resolveTranscriptionModelConfig(
  selection: VoiceProviderSelection,
  signal: AbortSignal
): Promise<AudioModelConfig> {
  return resolveSelectedAudioModel({
    modelId: selection.modelId,
    operation: 'transcription',
    approvedProviderId: selection.approvedProviderId,
    approved: selection,
    recognition: 'automatic',
    signal,
  });
}
