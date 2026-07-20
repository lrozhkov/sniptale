import {
  loadAIModels,
  loadAIProviders,
  loadAISecretProtectionStatus,
  loadChromeAiEnabled,
  loadDefaultModelId,
  loadGlobalSystemPrompt,
  loadScenarioEditorSystemPrompt,
  initializeAiStorageAccess,
} from '../../../composition/persistence/ai-settings';
import type {
  AIModelSelectionBootstrapPayload,
  AIProviderDestinationKind,
  AIProviderSelectorEntry,
  AISettingsPageRuntimeDataPayload,
  AiSettingsQueryMessage,
  AiSettingsQueryResponse,
} from '../../../contracts/messaging/ai-settings-runtime';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';

function classifyProviderDestination(provider: AIProvider): AIProviderDestinationKind {
  if (provider.connectionType === 'chrome-built-in') {
    return 'chrome-built-in';
  }

  try {
    return isPrivateNetworkHost(new URL(provider.baseUrl).hostname) ? 'local-custom' : 'external';
  } catch {
    return 'external';
  }
}

function createProviderSelectorEntry(provider: AIProvider): AIProviderSelectorEntry {
  return {
    connectionType: provider.connectionType,
    createdAt: provider.createdAt,
    destinationKind: classifyProviderDestination(provider),
    hasStoredApiKey: provider.hasStoredApiKey,
    id: provider.id,
    name: provider.name,
  };
}

async function loadStoredModelSelection(): Promise<{
  chromeAiEnabled: boolean;
  defaultModelId: string | null;
  globalSystemPrompt: string;
  models: AIModel[];
  providers: AIProvider[];
}> {
  await initializeAiStorageAccess();
  const [models, providers, chromeAiEnabled, defaultModelId, globalSystemPrompt] =
    await Promise.all([
      loadAIModels(),
      loadAIProviders(),
      loadChromeAiEnabled(),
      loadDefaultModelId(),
      loadGlobalSystemPrompt(),
    ]);

  return {
    chromeAiEnabled,
    defaultModelId,
    globalSystemPrompt: globalSystemPrompt ?? '',
    models,
    providers,
  };
}

async function loadSanitizedModelSelection(): Promise<AIModelSelectionBootstrapPayload> {
  const selection = await loadStoredModelSelection();

  return {
    ...selection,
    providers: selection.providers.map(createProviderSelectorEntry),
  };
}

async function loadSettingsPageRuntimeData(): Promise<AISettingsPageRuntimeDataPayload> {
  const [selectionBootstrap, scenarioEditorSystemPrompt, secretProtectionStatus] =
    await Promise.all([
      loadStoredModelSelection(),
      loadScenarioEditorSystemPrompt(),
      loadAISecretProtectionStatus(),
    ]);

  return {
    scenarioEditorSystemPrompt,
    secretProtectionStatus,
    selectionBootstrap,
  };
}

async function loadChromeAiContentSystemPrompt(modelId: string): Promise<string> {
  const { globalSystemPrompt, models } = await loadStoredModelSelection();
  const selectedModelPrompt =
    models.find((model) => model.id === modelId)?.systemPrompt?.trim() ?? '';

  return selectedModelPrompt || globalSystemPrompt.trim();
}

export async function resolveAISettingsQueryResponse(
  message: AiSettingsQueryMessage
): Promise<AiSettingsQueryResponse> {
  switch (message.operation) {
    case 'read-chrome-ai-content-system-prompt':
      return {
        success: true,
        systemPrompt: await loadChromeAiContentSystemPrompt(message.modelId),
      };
    case 'read-model-selection-bootstrap':
      return { success: true, modelSelection: await loadSanitizedModelSelection() };
    case 'read-scenario-editor-system-prompt':
      return {
        success: true,
        scenarioEditorSystemPrompt: await loadScenarioEditorSystemPrompt(),
      };
    case 'read-settings-page-runtime-data':
      return { success: true, settingsRuntimeData: await loadSettingsPageRuntimeData() };
  }
}
