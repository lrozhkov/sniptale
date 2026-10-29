import type { AIModel, AIProvider } from '../../../contracts/settings';
import {
  isAIScenario,
  isAIPersistedScenario,
  parseAIScenarioSelections,
  type AIScenario,
  type AIScenarioSelection,
  type AIRememberScenarioSelectionInput,
} from '../../../contracts/settings/ai-catalog';
import { supportsAIScenarioModel } from '../../../contracts/settings/model-operation';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { mergeChromeAiSelectorEntries } from '../../../features/ai/chrome/constants';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { loadSettings } from '../settings';
import {
  AI_CHROME_ENABLED_KEY,
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_SCENARIO_SELECTIONS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { parseStoredAIModels, parseStoredAIProviders } from './guards';
import { StaleAIModelSelectionError } from './selection-authority';

async function readScenarioState() {
  const stored = await browserStorage.local.get([
    AI_MODELS_KEY,
    AI_PROVIDERS_KEY,
    AI_SCENARIO_SELECTIONS_KEY,
    AI_CHROME_ENABLED_KEY,
    AI_STORAGE_VERSION_KEY,
    AI_STORAGE_RESET_PHASE_KEY,
  ]);
  const ready =
    stored[AI_STORAGE_VERSION_KEY] === AI_STORAGE_VERSION &&
    stored[AI_STORAGE_RESET_PHASE_KEY] === undefined;
  const external = {
    models: parseStoredAIModels(stored[AI_MODELS_KEY]).value,
    providers: parseStoredAIProviders(stored[AI_PROVIDERS_KEY]).value,
  };
  const entries =
    stored[AI_CHROME_ENABLED_KEY] === true ? mergeChromeAiSelectorEntries(external) : external;
  return {
    ready,
    ...entries,
    selections: parseAIScenarioSelections(stored[AI_SCENARIO_SELECTIONS_KEY]),
  };
}

function providerIncarnation(provider: AIProvider): string {
  return provider.connectionType === 'chrome-built-in'
    ? 'chrome-built-in'
    : (provider.incarnation ?? '');
}
function snapshot(
  model: AIModel,
  provider: AIProvider,
  source: AIScenarioSelection['source'],
  now: number
): AIScenarioSelection {
  return {
    modelId: model.id,
    modelCode: model.modelCode,
    providerId: provider.id,
    providerIncarnation: providerIncarnation(provider),
    displayName: model.displayName,
    source,
    selectedAt: now,
  };
}

/** Reads the canonical preference. Opening a project or picker does not write a choice. */
export async function loadAIScenarioSelection(
  scenario: AIScenario
): Promise<AIScenarioSelection | null> {
  if (!isAIScenario(scenario)) throw new Error('Invalid AI scenario');
  const state = await readScenarioState();
  if (!state.ready) return null;
  if (isAIPersistedScenario(scenario)) return state.selections[scenario] ?? null;
  const preferences = (await loadSettings()).voiceInput;
  const approved =
    scenario === 'voice-recognition' ? preferences?.transcription : preferences?.correction?.model;
  if (!approved) return null;
  const model = state.models.find(
    (entry) =>
      entry.id === approved.modelId &&
      entry.modelCode === approved.approvedModelCode &&
      entry.providerId === approved.approvedProviderId
  );
  const provider = state.providers.find((entry) => entry.id === approved.approvedProviderId);
  const matchesDestination =
    provider &&
    (await createAIProviderDestinationBinding(provider)) === approved.approvedDestination;
  if (model && provider && matchesDestination) return snapshot(model, provider, 'explicit', 0);
  return {
    modelId: approved.modelId,
    modelCode: approved.approvedModelCode,
    providerId: approved.approvedProviderId,
    providerIncarnation: 'unresolved-voice-approval',
    displayName: approved.approvedModelCode,
    source: 'explicit',
    selectedAt: 0,
  };
}

/** Called under the graph queue and exclusive permit only after an explicit picker choice or use. */
export async function rememberAIScenarioSelection(
  input: AIRememberScenarioSelectionInput,
  now: number,
  permit: PersistenceMutationPermit
): Promise<void> {
  if (!isAIPersistedScenario(input.scenario))
    throw new Error('Voice selections require canonical voice preferences');
  const state = await readScenarioState();
  const model = state.models.find((entry) => entry.id === input.modelId);
  const provider = state.providers.find((entry) => entry.id === model?.providerId);
  if (
    !state.ready ||
    !model ||
    !provider ||
    !providerIncarnation(provider) ||
    model.modelCode !== input.modelCode ||
    provider.id !== input.providerId ||
    !supportsAIScenarioModel(model, provider, input.scenario)
  )
    throw new StaleAIModelSelectionError();
  if (
    provider.connectionType !== 'chrome-built-in' &&
    (await createAIProviderDestinationBinding(provider)) !== input.destinationBinding
  )
    throw new StaleAIModelSelectionError();
  const selection = snapshot(model, provider, input.source, now);
  await browserStorage.local.set(
    { [AI_SCENARIO_SELECTIONS_KEY]: { ...state.selections, [input.scenario]: selection } },
    permit
  );
}
