import { useEffect, useRef, type MutableRefObject } from 'react';
import type { AutoBlurSettings } from '../../../../features/highlighter/contracts/auto-blur';
import { DEFAULT_AUTO_BLUR_SETTINGS, getLoadedAutoBlurSettingsSnapshot } from '../persistence';
import { createLogger } from '@sniptale/platform/observability/logger';
import { scanAutoBlurTargets, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import {
  applyAutoBlurWithSettings,
  loadSettingsOrDefault,
  type AutoBlurFrameManager,
} from './operations';
import { reportAutoBlurApplyResult } from './feedback';
import { isAutoBlurScanAbortError } from '../../../selection/auto-blur-runtime';

const logger = createLogger({ namespace: 'ContentAutoBlur' });
export function useAutoBlurAutoApplyEffect(args: {
  autoApplyAllowed: boolean;
  autoApplyEnabled: boolean;
  frameManager: AutoBlurFrameManager;
  isApplying: boolean;
  isOpen: boolean;
  cancelFullPageScan: (owner?: 'apply-once' | 'auto-apply') => void;
  runFullPageScan: <T>(
    owner: 'apply-once' | 'auto-apply',
    operation: (signal: AbortSignal) => Promise<T>
  ) => Promise<T>;
}) {
  const {
    autoApplyAllowed,
    autoApplyEnabled,
    cancelFullPageScan,
    frameManager,
    isApplying,
    isOpen,
    runFullPageScan,
  } = args;
  const appliedForCurrentAvailabilityRef = useRef(false);
  const frameManagerRef = useRef(frameManager);
  frameManagerRef.current = frameManager;

  useEffect(() => {
    if (!autoApplyEnabled || !autoApplyAllowed) {
      appliedForCurrentAvailabilityRef.current = false;
      return;
    }
    if (isOpen || isApplying || appliedForCurrentAvailabilityRef.current) {
      return;
    }

    appliedForCurrentAvailabilityRef.current = true;
    let cancelled = false;
    const activeFrameManager = frameManagerRef.current;
    void runFullPageScan('auto-apply', async (signal) => {
      const settings = await loadSettingsOrDefault();
      if (cancelled) throw new DOMException('Auto-blur scan was cancelled.', 'AbortError');
      return applyAutoBlurWithSettings({
        blurSettings: settings.blurSettings,
        frameManager: activeFrameManager,
        frames: activeFrameManager.frames,
        scanMode: 'full-page',
        selectedCategories: settings.selectedCategories,
        signal,
      });
    })
      .then((result) => {
        if (!cancelled) reportAutoBlurApplyResult(result.addedCount);
      })
      .catch((error) => {
        if (!isAutoBlurScanAbortError(error)) {
          logger.warn('Failed to auto-apply auto-blur targets', error);
        }
      });

    return () => {
      cancelled = true;
      cancelFullPageScan('auto-apply');
    };
  }, [autoApplyAllowed, autoApplyEnabled, cancelFullPageScan, isApplying, isOpen, runFullPageScan]);
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
  autoApplyAllowed: boolean;
  closeForMode: () => void;
  highlighterMode: boolean;
  isOpen: boolean;
}) {
  const { autoApplyAllowed, closeForMode, highlighterMode, isOpen } = args;

  useEffect(() => {
    if (!highlighterMode && !autoApplyAllowed && isOpen) {
      closeForMode();
    }
  }, [autoApplyAllowed, closeForMode, highlighterMode, isOpen]);
}
