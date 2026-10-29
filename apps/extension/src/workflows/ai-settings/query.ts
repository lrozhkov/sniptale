import {
  getAIScenarioOperation,
  type AIScenario,
  type AIPersistedScenario,
} from '../../contracts/settings/ai-catalog';
import { supportsAIScenarioModel } from '../../contracts/settings/model-operation';
import { resolveAIScenarioModel } from '../../features/ai/selection';
import {
  mergeChromeAiProviderSelectorEntries,
  mergeChromeAiSelectorEntries,
} from '../../features/ai/chrome/constants';
import { loadChromeAiAvailability } from '@sniptale/platform/browser/chrome-ai';
import type {
  AISettingsPageRuntimeDataPayload,
  AISettingsPageModelSelectionBootstrapPayload,
  AiSettingsQueryMessage,
  AiSettingsQueryResponse,
} from '../../contracts/messaging/ai-settings-runtime';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { sendRuntimeMessage } from '../../platform/runtime-messaging/index';

type AISettingsQueryInput = AiSettingsQueryMessage extends infer TMessage
  ? TMessage extends AiSettingsQueryMessage
    ? Omit<TMessage, 'type'>
    : never
  : never;

async function sendAISettingsQuery(
  message: AISettingsQueryInput
): Promise<AiSettingsQueryResponse> {
  const response = await sendRuntimeMessage({
    ...message,
    type: MessageType.AI_SETTINGS_QUERY,
  } as AiSettingsQueryMessage);
  if (!response.success) {
    throw new Error(response.error ?? 'AI settings query failed');
  }
  return response;
}

async function canUseChromeAi(chromeAiEnabled: boolean): Promise<boolean> {
  return chromeAiEnabled && (await loadChromeAiAvailability()) === 'available';
}

async function mergeSettingsPageModelSelection(
  selection: AISettingsPageModelSelectionBootstrapPayload
): Promise<AISettingsPageModelSelectionBootstrapPayload> {
  if (!(await canUseChromeAi(selection.chromeAiEnabled))) {
    return selection;
  }

  const merged = mergeChromeAiSelectorEntries({
    models: selection.models,
    providers: selection.providers,
  });

  return { ...selection, ...merged };
}

export async function requestAISettingsPageRuntimeData(): Promise<AISettingsPageRuntimeDataPayload> {
  const response = await sendAISettingsQuery({ operation: 'read-settings-page-runtime-data' });
  if (!response.settingsRuntimeData) {
    throw new Error('AI settings runtime data response missing payload');
  }

  return {
    ...response.settingsRuntimeData,
    selectionBootstrap: await mergeSettingsPageModelSelection(
      response.settingsRuntimeData.selectionBootstrap
    ),
  };
}

export async function requestScenarioEditorSystemPrompt(): Promise<string> {
  const response = await sendAISettingsQuery({ operation: 'read-scenario-editor-system-prompt' });
  if (response.scenarioEditorSystemPrompt === undefined) {
    throw new Error('Scenario editor system prompt response missing payload');
  }
  return response.scenarioEditorSystemPrompt;
}

export async function requestChromeAiContentSystemPrompt(modelId: string): Promise<string> {
  const response = await sendAISettingsQuery({
    modelId,
    operation: 'read-chrome-ai-content-system-prompt',
  });
  if (response.systemPrompt === undefined) {
    throw new Error('Chrome AI content system prompt response missing payload');
  }
  return response.systemPrompt;
}

/** Reads scenario context without changing preferences or inheriting a global default. */
export async function requestAIScenarioModelSelection(
  scenario: AIScenario,
  preferredProviderId?: string
) {
  const [catalog, remembered] = await Promise.all([
    sendAISettingsQuery({ operation: 'read-model-selection-bootstrap' }),
    sendAISettingsQuery({ operation: 'read-scenario-selection', scenario }),
  ]);
  if (!catalog.modelSelection || remembered.scenarioSelection === undefined)
    throw new Error('AI scenario selection response missing payload');
  const bootstrap = catalog.modelSelection;
  const entries =
    getAIScenarioOperation(scenario) === 'text' && (await canUseChromeAi(bootstrap.chromeAiEnabled))
      ? mergeChromeAiProviderSelectorEntries(bootstrap)
      : bootstrap;
  const resolution = resolveAIScenarioModel({
    scenario,
    models: entries.models,
    providers: entries.providers,
    selection: remembered.scenarioSelection,
    preferredProviderId,
  });
  const models = entries.models.filter((model) => {
    const provider = entries.providers.find((entry) => entry.id === model.providerId);
    return provider && supportsAIScenarioModel(model, provider, scenario);
  });
  return {
    scenario,
    globalSystemPrompt: bootstrap.globalSystemPrompt ?? '',
    models,
    providers: entries.providers,
    remembered: remembered.scenarioSelection,
    resolution,
  };
}

/** Persists only a visible explicit choice or the visible candidate the user elects to use. */
export async function rememberAIScenarioModelSelection(
  context: Awaited<ReturnType<typeof requestAIScenarioModelSelection>>,
  scenario: AIPersistedScenario,
  modelId: string,
  source: 'explicit' | 'initial' = 'explicit'
): Promise<void> {
  if (context.scenario !== scenario) throw new Error('AI selection scenario changed');
  const model = context.models.find((entry) => entry.id === modelId);
  const provider = context.providers.find((entry) => entry.id === model?.providerId);
  if (!model || !provider) throw new Error('AI model selection is unavailable');
  const response = await sendRuntimeMessage({
    type: MessageType.AI_SETTINGS_MUTATION,
    operation: 'remember-scenario-selection',
    selection: {
      scenario,
      modelId,
      modelCode: model.modelCode,
      providerId: provider.id,
      source,
      ...(provider.destinationBinding ? { destinationBinding: provider.destinationBinding } : {}),
    },
  });
  if (!response.success) throw new Error(response.error ?? 'AI model selection could not be saved');
}

/** Requests budgeted metadata maintenance without granting permission or approving a model. */
export async function refreshManagedAICatalogs(): Promise<void> {
  const response = await sendRuntimeMessage({
    type: MessageType.AI_SETTINGS_MUTATION,
    operation: 'refresh-managed-catalogs',
  });
  if (!response.success) throw new Error(response.error ?? 'AI catalog maintenance failed');
}
