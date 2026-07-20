import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { saveQuickActionsDisplayMode } from '../../../composition/persistence/quick-actions';
import type { QuickActionsDisplayMode } from '../../../contracts/settings';

const logger = createLogger({ namespace: 'SettingsQuickActionsDisplayMode' });

export async function persistDisplayMode(
  currentValue: QuickActionsDisplayMode,
  value: QuickActionsDisplayMode,
  setDisplayModeState: (value: QuickActionsDisplayMode) => void,
  onConfirm: (message: string) => void
) {
  if (currentValue === value) {
    return;
  }

  try {
    await saveQuickActionsDisplayMode(value);
    setDisplayModeState(value);
    onConfirm(translate('settings.quickActions.messageSettingSaved'));
  } catch (error) {
    logger.error('Failed to save quick actions display mode', error);
    toast.error(
      `${translate('common.states.error')}${translate('settings.quickActions.messageSaveErrorSuffix')}`
    );
  }
}
