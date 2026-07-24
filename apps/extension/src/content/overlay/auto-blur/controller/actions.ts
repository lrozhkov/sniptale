import { useCallback } from 'react';
import type { AutoBlurCategory } from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { saveAutoBlurSettings } from '../persistence';
import type { TranslationKey } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { selectAutoBlurMatches, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import {
  applyAutoBlurWithSettings,
  createTargets,
  loadSettingsOrDefault,
  persistSettings,
  type AutoBlurFrameManager,
} from './operations';

const logger = createLogger({ namespace: 'ContentAutoBlur' });
const APPLY_ERROR_MESSAGE_KEY = 'content.autoBlur.applyError' satisfies TranslationKey;

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
  blurSettings: BlurSettings;
  close: () => void;
  frameManager: AutoBlurFrameManager;
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatches: AutoBlurMatch[];
}) {
  await persistSettings(args);
  args.frameManager.syncAutoBlurFrames({
    blurSettings: args.blurSettings,
    targets: createTargets(args.selectedMatches),
  });
  args.close();
}

async function applySelectedAutoBlurTargets(args: {
  autoApplyEnabled: boolean;
  blurSettings: BlurSettings;
  close: () => void;
  frameManager: AutoBlurFrameManager;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
}) {
  await persistAndApplyTargets({
    autoApplyEnabled: args.autoApplyEnabled,
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

  return useCallback(async () => {
    beginApplying();

    try {
      await applySelectedAutoBlurTargets({
        autoApplyEnabled,
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
  }, [
    autoApplyEnabled,
    beginApplying,
    blurSettings,
    close,
    failApplying,
    frameManager,
    matches,
    selectedCategories,
    selectedMatchIds,
  ]);
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
      await applyAutoBlurWithSettings({
        blurSettings: settings.blurSettings,
        frameManager,
        frames: frameManager.frames,
        selectedCategories: settings.selectedCategories,
      });
    } catch (error) {
      logger.error('Failed to apply auto-blur once', error);
      failApplying(APPLY_ERROR_MESSAGE_KEY);
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
  frameManager: AutoBlurFrameManager;
  setAutoApplyEnabled: (enabled: boolean) => void;
}) {
  const {
    autoApplyAllowed,
    beginApplying,
    failApplying,
    finishApplying,
    frameManager,
    setAutoApplyEnabled,
  } = args;

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

      if (nextEnabled) {
        await applyAutoBlurWithSettings({
          blurSettings: settings.blurSettings,
          frameManager,
          frames: frameManager.frames,
          selectedCategories: settings.selectedCategories,
        });
      }
    } catch (error) {
      logger.error('Failed to toggle auto-blur mode', error);
      failApplying(APPLY_ERROR_MESSAGE_KEY);
    } finally {
      finishApplying();
    }
  }, [
    autoApplyAllowed,
    beginApplying,
    failApplying,
    finishApplying,
    frameManager,
    setAutoApplyEnabled,
  ]);
}
