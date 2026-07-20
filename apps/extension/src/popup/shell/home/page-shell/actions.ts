import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { openScreenshotMode, triggerQuickAction } from '../../navigation/actions';

export function usePopupHomeActions({
  screenshotDisabledReason,
  quickActionsDisabledReason,
}: {
  screenshotDisabledReason?: string | null;
  quickActionsDisabledReason?: string | null;
}) {
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpenScreenshotMode = async () => {
    if (screenshotDisabledReason) {
      setActionError(screenshotDisabledReason);
      return;
    }

    setActionError(null);

    try {
      await openScreenshotMode();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : translate('popup.home.openPrepError')
      );
    }
  };

  const handleQuickAction = async (actionId: string) => {
    if (quickActionsDisabledReason) {
      setActionError(quickActionsDisabledReason);
      return;
    }

    setActionError(null);

    try {
      await triggerQuickAction(actionId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : translate('popup.home.triggerQuickActionError')
      );
    }
  };

  return {
    actionError,
    handleOpenScreenshotMode,
    handleQuickAction,
  };
}
