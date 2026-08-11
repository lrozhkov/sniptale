import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { openScreenshotMode, triggerQuickAction } from '../../navigation/actions';
import type { QuickAction } from '../../../../contracts/settings';
import { isDesktopQuickAction } from '../../../../features/quick-actions-presets/policy';

export function usePopupHomeActions({
  screenshotDisabledReason,
  quickActionsDisabledReason,
  quickActions,
}: {
  screenshotDisabledReason?: string | null;
  quickActionsDisabledReason?: string | null;
  quickActions: QuickAction[];
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
    const action = quickActions.find((candidate) => candidate.id === actionId);
    if (quickActionsDisabledReason && (!action || !isDesktopQuickAction(action))) {
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
