import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'SettingsAiProvidersSection' });

export function reportAiProvidersLoaderError(error: unknown) {
  logger.error('Failed to load AI providers section data', error);
  toast.error(
    `${translate('common.states.error')}${translate('settings.aiProviders.loadErrorSuffix')}`
  );
}
