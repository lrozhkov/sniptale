import { useEffect, useRef } from 'react';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureActionType } from '../../../../contracts/settings';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { loadSettings } from '../../../../composition/persistence/settings';

const logger = createLogger({ namespace: 'ContentAppModeState' });

export function useCaptureActionPreference(
  captureAction: CaptureActionType,
  setCaptureAction: (action: CaptureActionType) => void
): void {
  const captureActionRef = useRef(captureAction);

  useEffect(() => {
    captureActionRef.current = captureAction;
  }, [captureAction]);

  useEffect(() => {
    loadSettings()
      .then((settings) => {
        if (captureActionRef.current === 'scenario') {
          return;
        }

        setCaptureAction(settings.captureAction ?? 'download_default');
      })
      .catch((error) => {
        logger.error('Failed to load captureAction', error);
      });
  }, [setCaptureAction]);
}

export function useSessionPresetReset(
  screenshotMode: boolean,
  setSessionActivePresetId: (presetId: string | null) => void
): void {
  useEffect(() => {
    if (!screenshotMode) {
      setSessionActivePresetId(null);
    }
  }, [screenshotMode, setSessionActivePresetId]);
}

export function useQuickActionToastCountdown(
  quickActionToastCountdown: number | null,
  setQuickActionToastCountdown: (seconds: number | null) => void
): void {
  useEffect(() => {
    if (quickActionToastCountdown === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setQuickActionToastCountdown(
        quickActionToastCountdown > 1 ? quickActionToastCountdown - 1 : null
      );
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [quickActionToastCountdown, setQuickActionToastCountdown]);
}

export function usePinnedToolbarModeCleanup(params: {
  pinToTab: boolean;
  scenarioPinned: boolean;
  screenshotMode: boolean;
  setPinToTab: (value: boolean) => void;
}) {
  const { pinToTab, scenarioPinned, screenshotMode, setPinToTab } = params;
  const previousScreenshotModeRef = useRef(screenshotMode);

  useEffect(() => {
    if (previousScreenshotModeRef.current && !screenshotMode && pinToTab && !scenarioPinned) {
      setPinToTab(false);
    }

    previousScreenshotModeRef.current = screenshotMode;
  }, [pinToTab, scenarioPinned, screenshotMode, setPinToTab]);
}

function restorePinnedToolbarState(
  params: {
    setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
    setIsToolbarVisible: (visible: boolean) => void;
    setScreenshotMode: (enabled: boolean) => void;
  },
  isCancelled: () => boolean
): void {
  getContentRuntimeServices()
    .messaging.sendRuntimeMessage({ type: MessageType.SCREENSHOT_MODE_STATUS })
    .then((response) => {
      if (isCancelled() || !response?.success) {
        return;
      }

      params.setCurrentViewport(response.viewport ?? null);
      if (!response.enabled) {
        return;
      }

      params.setScreenshotMode(true);
      params.setIsToolbarVisible(true);
    })
    .catch((error) => {
      logger.error('Failed to restore pinned toolbar state', error);
    });
}

export function usePinnedToolbarRestore(params: {
  pinToTab: boolean;
  scenarioPinned: boolean;
  screenshotMode: boolean;
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setScreenshotMode: (enabled: boolean) => void;
}) {
  const {
    pinToTab,
    scenarioPinned,
    screenshotMode,
    setCurrentViewport,
    setIsToolbarVisible,
    setScreenshotMode,
  } = params;

  useEffect(() => {
    if (!pinToTab || scenarioPinned || screenshotMode) {
      return;
    }

    let cancelled = false;

    restorePinnedToolbarState(
      { setCurrentViewport, setIsToolbarVisible, setScreenshotMode },
      () => cancelled
    );

    return () => {
      cancelled = true;
    };
  }, [
    pinToTab,
    scenarioPinned,
    screenshotMode,
    setCurrentViewport,
    setIsToolbarVisible,
    setScreenshotMode,
  ]);
}
