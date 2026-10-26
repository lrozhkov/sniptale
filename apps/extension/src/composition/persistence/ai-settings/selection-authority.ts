import type {
  VoiceInputPreferences,
  VoiceProviderSelection,
} from '@sniptale/runtime-contracts/voice-input';
import { supportsAIProviderModelOperation } from '../../../contracts/settings/model-operation';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { parseStoredAIModels, parseStoredAIProviders } from './guards';

export class StaleAIModelSelectionError extends Error {
  constructor() {
    super('AI model selection changed before it could be saved. Select an available model again.');
    this.name = 'StaleAIModelSelectionError';
  }
}

/** Validate the canonical voice tuple while the caller holds the exclusive persistence permit. */
export async function assertVoiceModelSelections(
  preferences: Partial<VoiceInputPreferences>
): Promise<void> {
  const selections: { selection: VoiceProviderSelection; operation: 'text' | 'transcription' }[] =
    [];
  if (preferences.transcription)
    selections.push({ selection: preferences.transcription, operation: 'transcription' });
  if (preferences.correction?.model)
    selections.push({ selection: preferences.correction.model, operation: 'text' });
  if (!selections.length) return;
  const stored = await browserStorage.local.get([
    AI_STORAGE_VERSION_KEY,
    AI_STORAGE_RESET_PHASE_KEY,
    AI_MODELS_KEY,
    AI_PROVIDERS_KEY,
  ]);
  if (
    stored[AI_STORAGE_VERSION_KEY] !== AI_STORAGE_VERSION ||
    stored[AI_STORAGE_RESET_PHASE_KEY] !== undefined
  )
    throw new StaleAIModelSelectionError();
  const models = parseStoredAIModels(stored[AI_MODELS_KEY]).value;
  const providers = parseStoredAIProviders(stored[AI_PROVIDERS_KEY]).value;
  for (const { selection, operation } of selections) {
    const model = models.find((entry) => entry.id === selection.modelId);
    const provider = providers.find((entry) => entry.id === model?.providerId);
    if (
      !model ||
      !provider ||
      provider.enabled === false ||
      !supportsAIProviderModelOperation(model, provider, operation) ||
      model.modelCode !== selection.approvedModelCode ||
      provider.id !== selection.approvedProviderId ||
      (await createAIProviderDestinationBinding(provider)) !== selection.approvedDestination
    ) {
      throw new StaleAIModelSelectionError();
    }
  }
}
