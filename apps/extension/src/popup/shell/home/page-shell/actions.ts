import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import {
  openScreenshotMode,
  triggerQuickAction,
  triggerScreenshotCapture,
} from '../../navigation/actions';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
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
  const [capturePending, setCapturePending] = useState(false);

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

  const handleScreenshotCapture = async (
    config: ScreenshotCaptureConfig,
    disabledReason: string | null
  ) => {
    if (disabledReason || capturePending) {
      if (disabledReason) setActionError(disabledReason);
      return;
    }
    setActionError(null);
    setCapturePending(true);
    try {
      await triggerScreenshotCapture(config);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translate('popup.home.captureError'));
      setCapturePending(false);
    }
  };

  return {
    actionError,
    capturePending,
    handleOpenScreenshotMode,
    handleQuickAction,
    handleScreenshotCapture,
  };
}
