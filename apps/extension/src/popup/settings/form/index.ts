import { useEffect, useState } from 'react';

import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  getPopupResponseErrorMessage,
  getPopupRuntimeErrorMessage,
} from '../../diagnostics/runtime-errors';
import { getPopupRuntimeServices } from '../../shell/runtime/services';

const logger = createLogger({ namespace: 'PopupSettingsForm' });

async function getActiveTabId() {
  const [tab] = await browserTabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function usePopupSettingsState() {
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [isTogglingToolbar, setIsTogglingToolbar] = useState(false);

  return {
    isToggling,
    isTogglingToolbar,
    screenshotMode,
    setIsToggling,
    setIsTogglingToolbar,
    setScreenshotMode,
    setShowToolbar,
    showToolbar,
  };
}

function usePopupSettingsSync(state: ReturnType<typeof usePopupSettingsState>) {
  useEffect(() => {
    const syncStatuses = () => {
      void Promise.all([
        checkScreenshotModeStatus(state.setScreenshotMode),
        checkToolbarStatus(state.setShowToolbar),
      ]);
    };

    syncStatuses();

    window.addEventListener('focus', syncStatuses);
    return () => window.removeEventListener('focus', syncStatuses);
  }, [state.setScreenshotMode, state.setShowToolbar]);
}

async function checkScreenshotModeStatus(setScreenshotMode: (enabled: boolean) => void) {
  try {
    const tabId = await getActiveTabId();

    if (!tabId) {
      return;
    }

    const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
      type: MessageType.SCREENSHOT_MODE_STATUS,
      tabId,
    });
    if (response?.success) {
      setScreenshotMode(response.enabled ?? false);
    }
  } catch (error) {
    logger.error('Failed to check screenshot mode status', error);
  }
}

async function checkToolbarStatus(setShowToolbar: (visible: boolean) => void) {
  try {
    const tabId = await getActiveTabId();

    if (!tabId) {
      return;
    }

    const response = await getPopupRuntimeServices().messaging.sendTabMessage(tabId, {
      type: MessageType.TOOLBAR_STATUS,
      tabId,
    });
    if (response?.success) {
      setShowToolbar(response.visible ?? false);
    }
  } catch (error) {
    logger.error('Failed to check toolbar status', error);
  }
}

function createNoActiveTabGuard(setLoading: (loading: boolean) => void) {
  return () => {
    toast.error(translate('popup.settingsForm.noActiveTab'));
    setLoading(false);
  };
}

function createToggleToolbarAction(state: ReturnType<typeof usePopupSettingsState>) {
  return async () => {
    state.setIsTogglingToolbar(true);

    try {
      const tabId = await getActiveTabId();

      if (!tabId) {
        createNoActiveTabGuard(state.setIsTogglingToolbar)();
        return;
      }

      const type = state.showToolbar ? MessageType.HIDE_TOOLBAR : MessageType.SHOW_TOOLBAR;
      const response = await getPopupRuntimeServices().messaging.sendTabMessage(tabId, {
        type,
        tabId,
      });
      if (response?.success) {
        state.setShowToolbar(!state.showToolbar);
      } else {
        toast.error(
          getPopupResponseErrorMessage(response, 'popup.settingsForm.toggleToolbarError')
        );
      }
    } catch (error) {
      logger.error('Failed to toggle toolbar', error);
      toast.error(
        getPopupRuntimeErrorMessage(error, 'popup.settingsForm.toggleToolbarErrorGeneric')
      );
    } finally {
      state.setIsTogglingToolbar(false);
    }
  };
}

function createToggleScreenshotModeAction(state: ReturnType<typeof usePopupSettingsState>) {
  return async () => {
    state.setIsToggling(true);

    try {
      const tabId = await getActiveTabId();

      if (!tabId) {
        createNoActiveTabGuard(state.setIsToggling)();
        return;
      }

      const type = state.screenshotMode
        ? MessageType.DISABLE_SCREENSHOT_MODE
        : MessageType.ENABLE_SCREENSHOT_MODE;
      const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
        type,
        tabId,
      });
      if (response?.success) {
        state.setScreenshotMode(!state.screenshotMode);
      } else {
        toast.error(getPopupResponseErrorMessage(response, 'popup.settingsForm.toggleModeError'));
      }
    } catch (error) {
      logger.error('Failed to toggle screenshot mode', error);
      toast.error(getPopupRuntimeErrorMessage(error, 'popup.settingsForm.toggleModeErrorGeneric'));
    } finally {
      state.setIsToggling(false);
    }
  };
}

function openSettingsPage() {
  void browserTabs.create({ url: runtimeInfo.getURL('apps/extension/src/settings/index.html') });
}

export function usePopupSettingsForm() {
  const state = usePopupSettingsState();

  usePopupSettingsSync(state);

  return {
    ...state,
    openSettingsPage,
    toggleScreenshotMode: createToggleScreenshotModeAction(state),
    toggleToolbar: createToggleToolbarAction(state),
  };
}
