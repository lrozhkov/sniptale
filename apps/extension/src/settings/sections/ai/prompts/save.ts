import {
  resetGlobalSystemPrompt,
  resetScenarioEditorSystemPrompt,
  saveGlobalSystemPrompt,
  saveScenarioEditorSystemPrompt,
} from '../../../runtime/ai-settings/mutations';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { getUserFacingErrorDetail } from '../../../../platform/i18n/user-facing-error';

const logger = createLogger({ namespace: 'SettingsAiPromptsSave' });

export async function saveAiProvidersGlobalPrompt(globalPrompt: string): Promise<string | null> {
  try {
    await saveGlobalSystemPrompt(globalPrompt);
    return null;
  } catch (error) {
    const message = [
      translate('common.states.error'),
      translate('settings.aiProviders.globalPromptSaveErrorSuffix'),
      ` ${getUserFacingErrorDetail('storage')}`,
    ].join('');
    logger.error('Failed to save global AI prompt', error);
    toast.error(message);
    return message;
  }
}

export async function saveAiProvidersScenarioEditorPrompt(prompt: string): Promise<string | null> {
  try {
    await saveScenarioEditorSystemPrompt(prompt);
    return null;
  } catch (error) {
    const message = [
      translate('common.states.error'),
      translate('settings.aiProviders.scenarioEditorPromptSaveErrorSuffix'),
      ` ${getUserFacingErrorDetail('storage')}`,
    ].join('');
    logger.error('Failed to save scenario editor AI prompt', error);
    toast.error(message);
    return message;
  }
}

type PromptResetResult = { error: string | null };

async function resetPrompt(args: {
  errorSuffixKey:
    | 'settings.aiProviders.globalPromptResetErrorSuffix'
    | 'settings.aiProviders.scenarioEditorPromptResetErrorSuffix';
  reset: () => Promise<void>;
}): Promise<PromptResetResult> {
  try {
    await args.reset();
    return { error: null };
  } catch (error) {
    const message = [
      translate('common.states.error'),
      translate(args.errorSuffixKey),
      ` ${getUserFacingErrorDetail('storage')}`,
    ].join('');
    logger.error('Failed to reset AI prompt', error);
    toast.error(message);
    return { error: message };
  }
}

export function resetAiProvidersGlobalPrompt(): Promise<PromptResetResult> {
  return resetPrompt({
    errorSuffixKey: 'settings.aiProviders.globalPromptResetErrorSuffix',
    reset: resetGlobalSystemPrompt,
  });
}

export function resetAiProvidersScenarioEditorPrompt(): Promise<PromptResetResult> {
  return resetPrompt({
    errorSuffixKey: 'settings.aiProviders.scenarioEditorPromptResetErrorSuffix',
    reset: resetScenarioEditorSystemPrompt,
  });
}
