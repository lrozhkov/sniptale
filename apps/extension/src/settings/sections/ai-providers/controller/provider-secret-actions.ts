import { clearAIProviderSecret } from '../runtime/settings-mutations';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'SettingsAiProviders' });

function buildProviderSecretClearErrorMessage(): string {
  return `${translate('common.states.error')}${translate('settings.aiProviders.providerSecretClearErrorSuffix')}`;
}

export async function handleAiProviderSecretClear(props: {
  providerId: string;
  reloadData: () => Promise<void>;
}): Promise<void> {
  try {
    await clearAIProviderSecret(props.providerId);
    toast.success(translate('settings.aiProviders.providerSecretCleared'));
    await props.reloadData();
  } catch (error) {
    logger.error('Clear provider secret failed', error);
    toast.error(buildProviderSecretClearErrorMessage());
  }
}
