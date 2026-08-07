import {
  saveGlobalSystemPrompt,
  saveScenarioEditorSystemPrompt,
} from '../../../runtime/ai-settings/mutations';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'SettingsAiPromptsSave' });

export async function saveAiProvidersGlobalPrompt(globalPrompt: string): Promise<string | null> {
  try {
    await saveGlobalSystemPrompt(globalPrompt);
    toast.success(translate('settings.aiProviders.globalPromptSavedMessage'));
    return null;
  } catch (error) {
    const message = [
      translate('common.states.error'),
      translate('settings.aiProviders.globalPromptSaveErrorSuffix'),
    ].join('');
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
    const message = [
      translate('common.states.error'),
      translate('settings.aiProviders.scenarioEditorPromptSaveErrorSuffix'),
    ].join('');
    logger.error('Failed to save scenario editor AI prompt', error);
    toast.error(message);
    return message;
  }
}
