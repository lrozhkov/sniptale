import { saveDefaultModelId } from '../../../../runtime/ai-settings/mutations';
import { translate } from '../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'SettingsAiProvidersSave' });

function buildAiProvidersDefaultModelErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.defaultModelSaveErrorSuffix')}`;
}

export async function saveAiProvidersDefaultModel(
  modelId: string | null,
  setDefaultModelId: (value: string | null) => void
): Promise<boolean> {
  try {
    await saveDefaultModelId(modelId);
    setDefaultModelId(modelId);
    return true;
  } catch (error) {
    logger.error('Failed to save default AI model', error);
    toast.error(buildAiProvidersDefaultModelErrorMessage());
    return false;
  }
}
