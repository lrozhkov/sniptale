import type { AIModel } from '../../contracts/settings';
import { type AIScenario, type AIScenarioSelection } from '../../contracts/settings/ai-catalog';
import { supportsAIScenarioModel } from '../../contracts/settings/model-operation';
import type { AIProviderSelectorEntry } from '../../contracts/messaging/ai-settings-runtime';
interface AIScenarioModelResolution {
  status: 'initial' | 'remembered' | 'unavailable' | 'empty';
  modelId: string | null;
  previousSelection: AIScenarioSelection | null;
  reason: 'model-unavailable' | 'provider-unavailable' | 'model-incompatible' | null;
}

/** Resolve an interface choice without replacing a remembered identity or persisting an initial candidate. */
export function resolveAIScenarioModel(input: {
  scenario: AIScenario;
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
  selection: AIScenarioSelection | null;
  preferredProviderId?: string | undefined;
}): AIScenarioModelResolution {
  const previousSelection = input.selection;
  if (previousSelection) {
    const provider = input.providers.find((entry) => entry.id === previousSelection.providerId);
    const model = input.models.find(
      (entry) =>
        entry.id === previousSelection.modelId &&
        entry.providerId === previousSelection.providerId &&
        entry.modelCode === previousSelection.modelCode
    );
    const incarnation =
      provider?.connectionType === 'chrome-built-in' ? 'chrome-built-in' : provider?.incarnation;
    const reason =
      !provider ||
      provider.enabled === false ||
      incarnation !== previousSelection.providerIncarnation
        ? 'provider-unavailable'
        : !model
          ? 'model-unavailable'
          : !supportsAIScenarioModel(model, provider, input.scenario)
            ? 'model-incompatible'
            : null;
    return {
      status: reason ? 'unavailable' : 'remembered',
      modelId: reason ? null : previousSelection.modelId,
      previousSelection,
      reason,
    };
  }
  if (input.scenario === 'voice-recognition' || input.scenario === 'voice-correction')
    return { status: 'empty', modelId: null, previousSelection: null, reason: null };
  const providers = input.preferredProviderId
    ? [
        ...input.providers.filter((provider) => provider.id === input.preferredProviderId),
        ...input.providers.filter((provider) => provider.id !== input.preferredProviderId),
      ]
    : input.providers;
  for (const provider of providers) {
    const candidate = input.models
      .filter(
        (model) =>
          model.providerId === provider.id &&
          supportsAIScenarioModel(model, provider, input.scenario)
      )
      .sort(
        (left, right) =>
          left.modelCode.localeCompare(right.modelCode, 'en') ||
          left.id.localeCompare(right.id, 'en')
      )[0];
    if (candidate)
      return { status: 'initial', modelId: candidate.id, previousSelection: null, reason: null };
  }
  return { status: 'empty', modelId: null, previousSelection: null, reason: null };
}
