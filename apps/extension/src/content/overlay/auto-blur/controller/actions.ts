import { useCallback } from 'react';
import type { AutoBlurCategory } from '../../../../features/highlighter/contracts/auto-blur';
import type {
  AppliedBorderSettings,
  BlurSettings,
} from '../../../../features/highlighter/contracts';
import { saveAutoBlurSettings } from '../persistence';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { selectAutoBlurMatches, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import {
  applyAutoBlurWithSettings,
  createTargets,
  loadSettingsOrDefault,
  persistSettings,
  type AutoBlurFrameManager,
} from './operations';
import { reportAutoBlurApplyResult } from './feedback';
import { isAutoBlurScanAbortError } from '../../../selection/auto-blur-runtime';

const logger = createLogger({ namespace: 'ContentAutoBlur' });
const APPLY_ERROR_MESSAGE_KEY = 'content.autoBlur.applyError' satisfies TranslationKey;
const APPLY_ONCE_ERROR_MESSAGE_KEY = 'content.autoBlur.applyOnceError' satisfies TranslationKey;

interface ApplyActionArgs {
  blurSettings: BlurSettings;
  autoApplyEnabled: boolean;
  enableAutoApplyOnApply: boolean;
  beginApplying: () => void;
  close: () => void;
  failApplying: (message: TranslationKey) => void;
  frameManager: AutoBlurFrameManager;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  setAutoApplyEnabled: (enabled: boolean) => void;
}

function createSelectedTargets(args: {
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  return selectAutoBlurMatches(args);
}

async function persistAndApplyTargets(args: {
  autoApplyEnabled: boolean;
  borderSettings: AppliedBorderSettings;
  blurSettings: BlurSettings;
  frameManager: AutoBlurFrameManager;
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatches: AutoBlurMatch[];
}) {
  await persistSettings(args);
  args.frameManager.syncAutoBlurFrames({
    borderSettings: args.borderSettings,
    blurSettings: args.blurSettings,
    targets: createTargets(args.selectedMatches),
  });
}

async function applySelectedAutoBlurTargets(args: {
  autoApplyEnabled: boolean;
  borderSettings: AppliedBorderSettings;
  blurSettings: BlurSettings;
  close: () => void;
  enableAutoApplyOnApply: boolean;
  frameManager: AutoBlurFrameManager;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  setAutoApplyEnabled: (enabled: boolean) => void;
}) {
  const autoApplyEnabled = args.autoApplyEnabled || args.enableAutoApplyOnApply;
  if (args.enableAutoApplyOnApply) {
    await persistSettings({
      autoApplyEnabled: true,
      blurSettings: args.blurSettings,
      selectedCategories: args.selectedCategories,
    });
    args.setAutoApplyEnabled(true);
    args.close();
    return;
  }
  await persistAndApplyTargets({
    autoApplyEnabled,
    borderSettings: args.borderSettings,
    blurSettings: args.blurSettings,
    frameManager: args.frameManager,
    selectedCategories: args.selectedCategories,
    selectedMatches: createSelectedTargets({
      matches: args.matches,
      selectedCategories: args.selectedCategories,
      selectedMatchIds: args.selectedMatchIds,
    }),
  });
  if (autoApplyEnabled !== args.autoApplyEnabled) {
    args.setAutoApplyEnabled(autoApplyEnabled);
  }
  args.close();
}

export function useApplyAction(args: ApplyActionArgs) {
  const {
    autoApplyEnabled,
    beginApplying,
    blurSettings,
    close,
    enableAutoApplyOnApply,
    failApplying,
    frameManager,
    matches,
    selectedCategories,
    selectedMatchIds,
    setAutoApplyEnabled,
  } = args;

  return useCallback(
    async (borderSettings: AppliedBorderSettings) => {
      beginApplying();

      try {
        await applySelectedAutoBlurTargets({
          autoApplyEnabled,
          borderSettings,
          blurSettings,
          close,
          enableAutoApplyOnApply,
          frameManager,
          matches,
          selectedCategories,
          selectedMatchIds,
          setAutoApplyEnabled,
        });
      } catch (error) {
        logger.error('Failed to apply auto-blur targets', error);
        failApplying(APPLY_ERROR_MESSAGE_KEY);
      }
    },
    [
      autoApplyEnabled,
      beginApplying,
      blurSettings,
      close,
      enableAutoApplyOnApply,
      failApplying,
      frameManager,
      matches,
      selectedCategories,
      selectedMatchIds,
      setAutoApplyEnabled,
    ]
  );
}

export function useApplyOnceAction(args: {
  beginApplying: () => void;
  failApplying: (message: TranslationKey) => void;
  finishApplying: () => void;
  frameManager: AutoBlurFrameManager;
  runFullPageScan: <T>(
    owner: 'apply-once' | 'auto-apply',
    operation: (signal: AbortSignal) => Promise<T>
  ) => Promise<T>;
}) {
  const { beginApplying, failApplying, finishApplying, frameManager, runFullPageScan } = args;

  return useCallback(async () => {
    beginApplying();

    try {
      const result = await runFullPageScan('apply-once', async (signal) => {
        const settings = await loadSettingsOrDefault();
        return applyAutoBlurWithSettings({
          blurSettings: settings.blurSettings,
          frameManager,
          frames: frameManager.frames,
          scanMode: 'full-page',
          selectedCategories: settings.selectedCategories,
          signal,
        });
      });
      reportAutoBlurApplyResult(result.addedCount);
    } catch (error) {
      if (isAutoBlurScanAbortError(error)) return;
      logger.error('Failed to apply auto-blur once', error);
      failApplying(APPLY_ERROR_MESSAGE_KEY);
      showToast(translate(APPLY_ONCE_ERROR_MESSAGE_KEY), 'error');
    } finally {
      finishApplying();
    }
  }, [beginApplying, failApplying, finishApplying, frameManager, runFullPageScan]);
}

export function useClearAutoBlurAction(args: {
  frameManager: AutoBlurFrameManager;
  matches: AutoBlurMatch[];
  reportError: (message: TranslationKey) => void;
}) {
  const { frameManager, matches, reportError } = args;

  return useCallback(() => {
    try {
      frameManager.clearAutoBlurFrames({ targets: createTargets(matches) });
    } catch (error) {
      logger.error('Failed to clear auto-blur frames', error);
      reportError(APPLY_ERROR_MESSAGE_KEY);
    }
  }, [frameManager, matches, reportError]);
}

export function useToggleAutoApplyAction(args: {
  autoApplyAllowed: boolean;
  beginApplying: () => void;
  failApplying: (message: TranslationKey) => void;
  finishApplying: () => void;
  setAutoApplyEnabled: (enabled: boolean) => void;
}) {
  const { autoApplyAllowed, beginApplying, failApplying, finishApplying, setAutoApplyEnabled } =
    args;

  return useCallback(async () => {
    beginApplying();

    try {
      const settings = await loadSettingsOrDefault();
      if (!autoApplyAllowed && !settings.autoApplyEnabled) {
        return;
      }

      const nextEnabled = !settings.autoApplyEnabled;
      const nextSettings = { ...settings, autoApplyEnabled: nextEnabled };
      await saveAutoBlurSettings(nextSettings);
      setAutoApplyEnabled(nextEnabled);
    } catch (error) {
      logger.error('Failed to toggle auto-blur mode', error);
      failApplying(APPLY_ERROR_MESSAGE_KEY);
    } finally {
      finishApplying();
    }
  }, [autoApplyAllowed, beginApplying, failApplying, finishApplying, setAutoApplyEnabled]);
}
