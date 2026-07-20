import type { QuickAction } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { saveQuickActions } from '../../../../composition/persistence/quick-actions';

const logger = createLogger({ namespace: 'SettingsQuickActions' });

export async function persistQuickActions(
  updatedActions: QuickAction[],
  setActions: (actions: QuickAction[]) => void
): Promise<boolean> {
  try {
    await saveQuickActions(updatedActions);
    setActions(updatedActions);
    return true;
  } catch (error) {
    logger.error('Failed to save quick actions', error);
    toast.error(
      `${translate('common.states.error')}${translate('settings.quickActions.messageSaveErrorSuffix')}`
    );
    return false;
  }
}
