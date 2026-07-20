import {
  deleteAIModel,
  deleteAIProvider as deleteAIProviderMutation,
} from '../runtime/settings-mutations';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { AiProvidersDeleteState } from './types';

const logger = createLogger({ namespace: 'SettingsAiProviders' });

export async function handleAiProvidersDelete(props: {
  confirmDelete: NonNullable<AiProvidersDeleteState>;
  reloadData: () => Promise<void>;
  setConfirmDelete: (value: AiProvidersDeleteState) => void;
}) {
  const { confirmDelete } = props;

  try {
    if (confirmDelete.type === 'provider') {
      await deleteAIProviderMutation(confirmDelete.item.id);
      toast.success(translate('settings.aiProviders.providerDeleted'));
    } else {
      await deleteAIModel(confirmDelete.item.id);
      toast.success(translate('settings.aiProviders.modelDeleted'));
    }

    await props.reloadData();
  } catch (error) {
    logAiProvidersDeleteError(confirmDelete.type, error);
    toast.error(buildAiProvidersDeleteErrorMessage(confirmDelete.type));
  } finally {
    props.setConfirmDelete(null);
  }
}

function buildAiProvidersDeleteErrorMessage(type: 'model' | 'provider') {
  return type === 'provider'
    ? `${translate('common.states.error')}${translate('settings.aiProviders.providerDeleteErrorSuffix')}`
    : `${translate('common.states.error')}${translate('settings.aiProviders.modelDeleteErrorSuffix')}`;
}

function logAiProvidersDeleteError(type: 'model' | 'provider', error: unknown) {
  logger.error(type === 'provider' ? 'Delete provider failed' : 'Delete model failed', error);
}
