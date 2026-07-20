import { useEffect } from 'react';
import { translate } from '../../../../platform/i18n';
import { disableNavigationLock, enableNavigationLock } from '../../../selection/locker';

export function resolveToolbarNavigationLockMode(params: {
  highlighterMode: boolean;
  quickEditMode: boolean;
  screenshotMode: boolean;
  aiPickMode: boolean;
  isCursorMode: boolean;
}): boolean | null {
  if (params.highlighterMode || params.quickEditMode || params.aiPickMode) {
    return true;
  }

  if (params.isCursorMode) {
    return null;
  }

  if (params.screenshotMode) {
    return false;
  }

  return null;
}

export function useToolbarManagedNavigationEffect(params: {
  aiPickMode: boolean;
  highlighterMode: boolean;
  isCursorMode: boolean;
  quickEditMode: boolean;
  scenarioByClickActive: boolean;
  scenarioCaptureMode?: 'manual' | 'by-click';
  scenarioEnabled?: boolean;
  screenshotMode: boolean;
  setNavigationLockEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    aiPickMode,
    highlighterMode,
    isCursorMode,
    quickEditMode,
    scenarioByClickActive,
    scenarioCaptureMode,
    scenarioEnabled,
    screenshotMode,
    setNavigationLockEnabled,
  } = params;
  const nextLockMode = resolveToolbarNavigationLockMode({
    highlighterMode,
    isCursorMode,
    quickEditMode,
    screenshotMode,
    aiPickMode,
  });

  useEffect(() => {
    syncToolbarManagedNavigation({
      nextLockMode,
      scenarioByClickActive,
      setNavigationLockEnabled,
    });
  }, [
    aiPickMode,
    highlighterMode,
    isCursorMode,
    quickEditMode,
    scenarioByClickActive,
    scenarioCaptureMode,
    scenarioEnabled,
    screenshotMode,
    setNavigationLockEnabled,
    nextLockMode,
  ]);
}

function syncToolbarManagedNavigation(params: {
  nextLockMode: boolean | null;
  scenarioByClickActive: boolean;
  setNavigationLockEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  if (params.scenarioByClickActive) {
    disableNavigationLock();
    params.setNavigationLockEnabled(false);
    return;
  }

  if (params.nextLockMode === null) {
    disableNavigationLock();
    params.setNavigationLockEnabled(false);
    return;
  }

  params.setNavigationLockEnabled(true);

  enableNavigationLock(params.nextLockMode);
}

export function resolveToolbarLockPresentation(params: {
  aiPickMode: boolean;
  highlighterMode: boolean;
  isCursorMode: boolean;
  navigationLockEnabled: boolean;
  quickEditMode: boolean;
  scenarioByClickActive: boolean;
  screenshotMode: boolean;
}) {
  const lockDisabled =
    !params.screenshotMode ||
    params.isCursorMode ||
    params.highlighterMode ||
    params.quickEditMode ||
    params.aiPickMode ||
    params.scenarioByClickActive;
  const lockTitle = lockDisabled
    ? translate('content.toolbar.navigationLockManaged')
    : params.navigationLockEnabled
      ? translate('content.toolbar.navigationUnlock')
      : translate('content.toolbar.navigationLock');

  return { lockDisabled, lockTitle };
}
