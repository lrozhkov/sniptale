import { useEffect, type MutableRefObject } from 'react';
import type { AutoBlurSettings } from '../../../../features/highlighter/contracts/auto-blur';
import {
  DEFAULT_AUTO_BLUR_SETTINGS,
  getLoadedAutoBlurSettingsSnapshot,
  loadAutoBlurSettings,
} from '../persistence';
import type { TranslationKey } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { scanAutoBlurTargets, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import { applyAutoBlurWithSettings } from './operations';
import { cloneSettings } from './state';
import type { AutoBlurStatus, FrameManager } from './types';

const logger = createLogger({ namespace: 'ContentAutoBlur' });
const AUTO_APPLY_DEBOUNCE_MS = 300;

type AutoApplyRuntimeState = {
  cancelled: boolean;
  running: boolean;
  timeoutId: number | null;
};

async function loadSettingsSafely(): Promise<AutoBlurSettings> {
  try {
    return await loadAutoBlurSettings();
  } catch (error) {
    logger.warn('Failed to load auto-blur settings, falling back to defaults', error);
    return cloneSettings(DEFAULT_AUTO_BLUR_SETTINGS);
  }
}

export function useAutoBlurAutoApplyEffect(args: {
  autoApplyAllowed: boolean;
  autoApplyEnabled: boolean;
  frameManager: FrameManager;
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
  frameManager: FrameManager;
  runtimeState: AutoApplyRuntimeState;
}) {
  if (args.runtimeState.running) {
    return;
  }

  args.runtimeState.running = true;
  try {
    const settings = await loadSettingsSafely();
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
  frameManager: FrameManager;
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

    void loadSettingsSafely().then((settings) => {
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
  frames: FrameManager['frames'];
  isOpen: boolean;
  resetSelection: (settings: AutoBlurSettings) => void;
  scanVersionRef: MutableRefObject<number>;
  setErrorMessage: (message: TranslationKey | null) => void;
  setMatches: (matches: AutoBlurMatch[]) => void;
  setStatus: (status: AutoBlurStatus) => void;
}) {
  const { frames, isOpen, resetSelection, scanVersionRef } = args;
  const { setErrorMessage, setMatches, setStatus } = args;

  useEffect(() => {
    if (!isOpen) return;

    const scanVersion = ++scanVersionRef.current;
    const snapshot = getLoadedAutoBlurSettingsSnapshot() ?? DEFAULT_AUTO_BLUR_SETTINGS;
    resetSelection(snapshot);
    setStatus('loading');
    setErrorMessage(null);

    void Promise.all([loadSettingsSafely(), scanAutoBlurTargets({ frames })])
      .then(([settings, result]) => {
        if (scanVersion !== scanVersionRef.current) return;

        resetSelection(settings);
        setMatches(result.matches);
        setStatus(result.matches.length > 0 ? 'ready' : 'empty');
      })
      .catch((error: unknown) => {
        if (scanVersion !== scanVersionRef.current) return;

        logger.error('Failed to scan auto-blur targets', error);
        setMatches([]);
        setStatus('error');
      });
  }, [frames, isOpen, resetSelection, scanVersionRef, setErrorMessage, setMatches, setStatus]);
}

export function useHighlighterModeCloseEffect(args: {
  highlighterMode: boolean;
  isOpen: boolean;
  scanVersionRef: MutableRefObject<number>;
  setIsOpen: (isOpen: boolean) => void;
}) {
  const { highlighterMode, isOpen, scanVersionRef, setIsOpen } = args;

  useEffect(() => {
    if (!highlighterMode && isOpen) {
      scanVersionRef.current += 1;
      setIsOpen(false);
    }
  }, [highlighterMode, isOpen, scanVersionRef, setIsOpen]);
}
