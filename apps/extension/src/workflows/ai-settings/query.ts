import {
  isChromeAiModelId,
  mergeChromeAiProviderSelectorEntries,
  mergeChromeAiSelectorEntries,
} from '../../features/ai/chrome/constants';
import { resolveSelectedAIModelId } from '../../features/ai/selection';
import { loadChromeAiAvailability } from '@sniptale/platform/browser/chrome-ai';
import type {
  AIModelSelectionBootstrapPayload,
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

async function mergeChromeAiModelSelection(
  selection: AIModelSelectionBootstrapPayload
): Promise<AIModelSelectionBootstrapPayload> {
  if (!(await canUseChromeAi(selection.chromeAiEnabled))) {
    return {
      ...selection,
      defaultModelId: isChromeAiModelId(selection.defaultModelId)
        ? resolveSelectedAIModelId(selection.models, null)
        : selection.defaultModelId,
    };
  }

  const merged = mergeChromeAiProviderSelectorEntries({
    models: selection.models,
    providers: selection.providers,
  });

  return { ...selection, ...merged };
}

async function mergeSettingsPageModelSelection(
  selection: AISettingsPageModelSelectionBootstrapPayload
): Promise<AISettingsPageModelSelectionBootstrapPayload> {
  if (!(await canUseChromeAi(selection.chromeAiEnabled))) {
    return {
      ...selection,
      defaultModelId: isChromeAiModelId(selection.defaultModelId)
        ? resolveSelectedAIModelId(selection.models, null)
        : selection.defaultModelId,
    };
  }

  const merged = mergeChromeAiSelectorEntries({
    models: selection.models,
    providers: selection.providers,
  });

  return { ...selection, ...merged };
}

export async function requestAIModelSelectionBootstrap(): Promise<AIModelSelectionBootstrapPayload> {
  const response = await sendAISettingsQuery({ operation: 'read-model-selection-bootstrap' });
  if (!response.modelSelection) {
    throw new Error('AI model selection bootstrap response missing payload');
  }

  return mergeChromeAiModelSelection(response.modelSelection);
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
