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

const logger = createLogger({ namespace: 'ContentAutoBlur' });
export function useAutoBlurAutoApplyEffect(args: {
  autoApplyAllowed: boolean;
  autoApplyEnabled: boolean;
  frameManager: AutoBlurFrameManager;
  isApplying: boolean;
  isOpen: boolean;
}) {
  const { autoApplyAllowed, autoApplyEnabled, frameManager, isApplying, isOpen } = args;
  const appliedForCurrentAvailabilityRef = useRef(false);

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
    void loadSettingsOrDefault()
      .then(async (settings) => {
        if (cancelled) return;
        const result = await applyAutoBlurWithSettings({
          blurSettings: settings.blurSettings,
          frameManager,
          frames: frameManager.frames,
          scanMode: 'full-page',
          selectedCategories: settings.selectedCategories,
        });
        if (!cancelled) reportAutoBlurApplyResult(result.addedCount);
      })
      .catch((error) => logger.warn('Failed to auto-apply auto-blur targets', error));

    return () => {
      cancelled = true;
    };
  }, [autoApplyAllowed, autoApplyEnabled, frameManager, isApplying, isOpen]);
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
