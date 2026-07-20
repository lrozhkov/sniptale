import { useCallback } from 'react';
import type {
  AutoBlurCategory,
  AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { saveAutoBlurSettings } from '../persistence';
import type { TranslationKey } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { selectAutoBlurMatches, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import { cloneSettings } from './state';
import type { AutoBlurMutableState, FrameManager } from './types';
import {
  applyAutoBlurWithSettings,
  createTargets,
  loadSettingsOrDefault,
  persistSettings,
} from './operations';

const logger = createLogger({ namespace: 'ContentAutoBlur' });
const APPLY_ERROR_MESSAGE_KEY = 'content.autoBlur.applyError' satisfies TranslationKey;

interface ApplyActionArgs {
  blurSettings: BlurSettings;
  autoApplyEnabled: boolean;
  close: () => void;
  frameManager: FrameManager;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  setErrorMessage: (message: TranslationKey | null) => void;
  setIsApplying: (isApplying: boolean) => void;
}

export function useResetSelection(args: {
  refs: AutoBlurMutableState['refs'];
  setAutoApplyEnabled: AutoBlurMutableState['setAutoApplyEnabled'];
  setBlurSettings: AutoBlurMutableState['setBlurSettings'];
  setSelectedCategories: AutoBlurMutableState['setSelectedCategories'];
  setSelectedMatchIds: AutoBlurMutableState['setSelectedMatchIds'];
}) {
  const { refs, setAutoApplyEnabled, setBlurSettings, setSelectedCategories, setSelectedMatchIds } =
    args;

  return useCallback(
    (settings: AutoBlurSettings) => {
      refs.loadedSettingsRef.current = cloneSettings(settings);
      setAutoApplyEnabled(settings.autoApplyEnabled);
      setSelectedCategories(new Set(settings.selectedCategories));
      setSelectedMatchIds(new Set());
      setBlurSettings({ ...settings.blurSettings });
    },
    [refs, setAutoApplyEnabled, setBlurSettings, setSelectedCategories, setSelectedMatchIds]
  );
}

export function useCloseAction(args: {
  refs: AutoBlurMutableState['refs'];
  setErrorMessage: AutoBlurMutableState['setErrorMessage'];
  setIsApplying: AutoBlurMutableState['setIsApplying'];
  setIsOpen: AutoBlurMutableState['setIsOpen'];
}) {
  const { refs, setErrorMessage, setIsApplying, setIsOpen } = args;

  return useCallback(() => {
    refs.scanVersionRef.current += 1;
    setIsOpen(false);
    setIsApplying(false);
    setErrorMessage(null);
  }, [refs, setErrorMessage, setIsApplying, setIsOpen]);
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
  frameManager: FrameManager;
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
  frameManager: FrameManager;
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
    blurSettings,
    close,
    frameManager,
    matches,
    selectedCategories,
    selectedMatchIds,
    setErrorMessage,
    setIsApplying,
  } = args;

  return useCallback(async () => {
    setIsApplying(true);
    setErrorMessage(null);

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
      setErrorMessage(APPLY_ERROR_MESSAGE_KEY);
      setIsApplying(false);
    }
  }, [
    autoApplyEnabled,
    blurSettings,
    close,
    frameManager,
    matches,
    selectedCategories,
    selectedMatchIds,
    setErrorMessage,
    setIsApplying,
  ]);
}

export function useApplyOnceAction(args: {
  frameManager: FrameManager;
  setErrorMessage: (message: TranslationKey | null) => void;
  setIsApplying: (isApplying: boolean) => void;
}) {
  const { frameManager, setErrorMessage, setIsApplying } = args;

  return useCallback(async () => {
    setIsApplying(true);
    setErrorMessage(null);

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
      setErrorMessage(APPLY_ERROR_MESSAGE_KEY);
    } finally {
      setIsApplying(false);
    }
  }, [frameManager, setErrorMessage, setIsApplying]);
}

export function useClearAutoBlurAction(args: {
  frameManager: FrameManager;
  matches: AutoBlurMatch[];
  setErrorMessage: (message: TranslationKey | null) => void;
}) {
  const { frameManager, matches, setErrorMessage } = args;

  return useCallback(() => {
    try {
      frameManager.clearAutoBlurFrames({ targets: createTargets(matches) });
    } catch (error) {
      logger.error('Failed to clear auto-blur frames', error);
      setErrorMessage(APPLY_ERROR_MESSAGE_KEY);
    }
  }, [frameManager, matches, setErrorMessage]);
}

export function useToggleAutoApplyAction(args: {
  autoApplyAllowed: boolean;
  frameManager: FrameManager;
  setAutoApplyEnabled: (enabled: boolean) => void;
  setErrorMessage: (message: TranslationKey | null) => void;
  setIsApplying: (isApplying: boolean) => void;
}) {
  const { autoApplyAllowed, frameManager, setAutoApplyEnabled, setErrorMessage, setIsApplying } =
    args;

  return useCallback(async () => {
    setIsApplying(true);
    setErrorMessage(null);

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
      setErrorMessage(APPLY_ERROR_MESSAGE_KEY);
    } finally {
      setIsApplying(false);
    }
  }, [autoApplyAllowed, frameManager, setAutoApplyEnabled, setErrorMessage, setIsApplying]);
}
