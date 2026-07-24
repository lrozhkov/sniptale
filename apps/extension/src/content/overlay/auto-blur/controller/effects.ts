import { useEffect, type MutableRefObject } from 'react';
import type { AutoBlurSettings } from '../../../../features/highlighter/contracts/auto-blur';
import { DEFAULT_AUTO_BLUR_SETTINGS, getLoadedAutoBlurSettingsSnapshot } from '../persistence';
import { createLogger } from '@sniptale/platform/observability/logger';
import { scanAutoBlurTargets, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import {
  applyAutoBlurWithSettings,
  loadSettingsOrDefault,
  type AutoBlurFrameManager,
} from './operations';

const logger = createLogger({ namespace: 'ContentAutoBlur' });
const AUTO_APPLY_DEBOUNCE_MS = 300;

type AutoApplyRuntimeState = {
  cancelled: boolean;
  running: boolean;
  timeoutId: number | null;
};

export function useAutoBlurAutoApplyEffect(args: {
  autoApplyAllowed: boolean;
  autoApplyEnabled: boolean;
  frameManager: AutoBlurFrameManager;
  isApplying: boolean;
  isOpen: boolean;
}) {
  const { autoApplyAllowed, autoApplyEnabled, frameManager, isApplying, isOpen } = args;

  useEffect(() => {
    if (!autoApplyEnabled || !autoApplyAllowed || isOpen || isApplying) {
      return;
    }

    const runtimeState: AutoApplyRuntimeState = {
      cancelled: false,
      running: false,
      timeoutId: null,
    };
    const scheduleApply = () => scheduleAutoApply({ frameManager, runtimeState });
    const observer = new MutationObserver(scheduleApply);

    scheduleApply();
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });

    return () => {
      cleanupAutoApply(runtimeState, observer);
    };
  }, [autoApplyAllowed, autoApplyEnabled, frameManager, isApplying, isOpen]);
}

async function runAutoApply(args: {
  frameManager: AutoBlurFrameManager;
  runtimeState: AutoApplyRuntimeState;
}) {
  if (args.runtimeState.running) {
    return;
  }

  args.runtimeState.running = true;
  try {
    const settings = await loadSettingsOrDefault();
    if (args.runtimeState.cancelled || !settings.autoApplyEnabled) {
      return;
    }

    await applyAutoBlurWithSettings({
      blurSettings: settings.blurSettings,
      frameManager: args.frameManager,
      frames: args.frameManager.frames,
      selectedCategories: settings.selectedCategories,
    });
  } catch (error) {
    logger.warn('Failed to auto-apply auto-blur targets', error);
  } finally {
    args.runtimeState.running = false;
  }
}

function scheduleAutoApply(args: {
  frameManager: AutoBlurFrameManager;
  runtimeState: AutoApplyRuntimeState;
}) {
  if (args.runtimeState.timeoutId !== null) {
    window.clearTimeout(args.runtimeState.timeoutId);
  }

  args.runtimeState.timeoutId = window.setTimeout(() => {
    void runAutoApply(args);
  }, AUTO_APPLY_DEBOUNCE_MS);
}

function cleanupAutoApply(runtimeState: AutoApplyRuntimeState, observer: MutationObserver) {
  runtimeState.cancelled = true;
  observer.disconnect();
  if (runtimeState.timeoutId !== null) {
    window.clearTimeout(runtimeState.timeoutId);
  }
}

export function useAutoBlurSettingsBootstrapEffect(args: {
  resetSelection: (settings: AutoBlurSettings) => void;
}) {
  const { resetSelection } = args;

  useEffect(() => {
    let cancelled = false;

    void loadSettingsOrDefault().then((settings) => {
      if (!cancelled) {
        resetSelection(settings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resetSelection]);
}

export function useAutoBlurScanEffect(args: {
  completeScan: (settings: AutoBlurSettings, matches: AutoBlurMatch[]) => void;
  failScan: () => void;
  frames: AutoBlurFrameManager['frames'];
  isOpen: boolean;
  scanVersionRef: MutableRefObject<number>;
  startScan: (settings: AutoBlurSettings) => void;
}) {
  const { completeScan, failScan, frames, isOpen, scanVersionRef, startScan } = args;

  useEffect(() => {
    if (!isOpen) return;

    const scanVersion = ++scanVersionRef.current;
    const snapshot = getLoadedAutoBlurSettingsSnapshot() ?? DEFAULT_AUTO_BLUR_SETTINGS;
    startScan(snapshot);

    void Promise.all([loadSettingsOrDefault(), scanAutoBlurTargets({ frames })])
      .then(([settings, result]) => {
        if (scanVersion !== scanVersionRef.current) return;

        completeScan(settings, result.matches);
      })
      .catch((error: unknown) => {
        if (scanVersion !== scanVersionRef.current) return;

        logger.error('Failed to scan auto-blur targets', error);
        failScan();
      });
  }, [completeScan, failScan, frames, isOpen, scanVersionRef, startScan]);
}

export function useHighlighterModeCloseEffect(args: {
  closeForMode: () => void;
  highlighterMode: boolean;
  isOpen: boolean;
}) {
  const { closeForMode, highlighterMode, isOpen } = args;

  useEffect(() => {
    if (!highlighterMode && isOpen) {
      closeForMode();
    }
  }, [closeForMode, highlighterMode, isOpen]);
}
