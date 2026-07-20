import {
  saveDefaultModelId,
  saveGlobalSystemPrompt,
  saveScenarioEditorSystemPrompt,
} from '../runtime/settings-mutations';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'SettingsAiProvidersSave' });

function buildAiProvidersDefaultModelErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.defaultModelSaveErrorSuffix')}`;
}

function buildAiProvidersGlobalPromptErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.globalPromptSaveErrorSuffix')}`;
}

function buildAiProvidersScenarioEditorPromptErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.scenarioEditorPromptSaveErrorSuffix')}`;
}

export async function saveAiProvidersDefaultModel(
  modelId: string | null,
  setDefaultModelId: (value: string | null) => void
): Promise<boolean> {
  try {
    await saveDefaultModelId(modelId);
    setDefaultModelId(modelId);
    toast.success(translate('settings.aiProviders.defaultModelUpdated'));
    return true;
  } catch (error) {
    logger.error('Failed to save default AI model', error);
    toast.error(buildAiProvidersDefaultModelErrorMessage());
    return false;
  }
}

export async function saveAiProvidersGlobalPrompt(globalPrompt: string): Promise<string | null> {
  try {
    await saveGlobalSystemPrompt(globalPrompt);
    toast.success(translate('settings.aiProviders.globalPromptSavedMessage'));
    return null;
  } catch (error) {
    const message = buildAiProvidersGlobalPromptErrorMessage();
    logger.error('Failed to save global AI prompt', error);
    toast.error(message);
    return message;
  }
}

export async function saveAiProvidersScenarioEditorPrompt(prompt: string): Promise<string | null> {
  try {
    await saveScenarioEditorSystemPrompt(prompt);
    toast.success(translate('settings.aiProviders.scenarioEditorPromptSavedMessage'));
    return null;
  } catch (error) {
    const message = buildAiProvidersScenarioEditorPromptErrorMessage();
    logger.error('Failed to save scenario editor AI prompt', error);
    toast.error(message);
    return message;
  }
}
