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

const logger = createLogger({ namespace: 'ContentAutoBlur' });
const APPLY_ERROR_MESSAGE_KEY = 'content.autoBlur.applyError' satisfies TranslationKey;
const APPLY_ONCE_ERROR_MESSAGE_KEY = 'content.autoBlur.applyOnceError' satisfies TranslationKey;

interface ApplyActionArgs {
  blurSettings: BlurSettings;
  autoApplyEnabled: boolean;
  beginApplying: () => void;
  close: () => void;
  failApplying: (message: TranslationKey) => void;
  frameManager: AutoBlurFrameManager;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
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
  close: () => void;
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
  args.close();
}

async function applySelectedAutoBlurTargets(args: {
  autoApplyEnabled: boolean;
  borderSettings: AppliedBorderSettings;
  blurSettings: BlurSettings;
  close: () => void;
  frameManager: AutoBlurFrameManager;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  await persistAndApplyTargets({
    autoApplyEnabled: args.autoApplyEnabled,
    borderSettings: args.borderSettings,
    blurSettings: args.blurSettings,
    close: args.close,
    frameManager: args.frameManager,
    selectedCategories: args.selectedCategories,
    selectedMatches: createSelectedTargets({
      matches: args.matches,
      selectedCategories: args.selectedCategories,
      selectedMatchIds: args.selectedMatchIds,
    }),
  });
}

export function useApplyAction(args: ApplyActionArgs) {
  const {
    autoApplyEnabled,
    beginApplying,
    blurSettings,
    close,
    failApplying,
    frameManager,
    matches,
    selectedCategories,
    selectedMatchIds,
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
          frameManager,
          matches,
          selectedCategories,
          selectedMatchIds,
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
      failApplying,
      frameManager,
      matches,
      selectedCategories,
      selectedMatchIds,
    ]
  );
}

export function useApplyOnceAction(args: {
  beginApplying: () => void;
  failApplying: (message: TranslationKey) => void;
  finishApplying: () => void;
  frameManager: AutoBlurFrameManager;
}) {
  const { beginApplying, failApplying, finishApplying, frameManager } = args;

  return useCallback(async () => {
    beginApplying();

    try {
      const settings = await loadSettingsOrDefault();
      const result = await applyAutoBlurWithSettings({
        blurSettings: settings.blurSettings,
        frameManager,
        frames: frameManager.frames,
        scanMode: 'full-page',
        selectedCategories: settings.selectedCategories,
      });
      reportAutoBlurApplyResult(result.addedCount);
    } catch (error) {
      logger.error('Failed to apply auto-blur once', error);
      failApplying(APPLY_ERROR_MESSAGE_KEY);
      showToast(translate(APPLY_ONCE_ERROR_MESSAGE_KEY), 'error');
    } finally {
      finishApplying();
    }
  }, [beginApplying, failApplying, finishApplying, frameManager]);
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
