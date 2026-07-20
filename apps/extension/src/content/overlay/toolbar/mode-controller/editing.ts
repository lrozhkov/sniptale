import { createLogger } from '@sniptale/platform/observability/logger';
import { disableHighlighterMode, enableHighlighterMode } from '../../../selection/highlighter';
import { disableQuickEditMode, enableQuickEditMode } from '../../../selection/quick-edit';
import { preloadSelectionMode } from '../../../selection/selection-mode/lazy';
import { createQuickEditDocumentModeToggle, resetQuickEditDocumentMode } from './document-mode';
import type { UseToolbarModeControllerParams } from './types';

type ToolbarEditingParams = Pick<
  UseToolbarModeControllerParams,
  | 'aiPickMode'
  | 'disableAiPickMode'
  | 'highlighterMode'
  | 'quickEditMode'
  | 'setAiPickMode'
  | 'setHighlighterMode'
  | 'setIsToolbarVisible'
  | 'setNavigationLockEnabled'
  | 'setQuickEditDocumentMode'
  | 'setQuickEditMode'
  | 'setScreenshotMode'
>;

const logger = createLogger({ namespace: 'ContentToolbarModeEditing' });

type ScreenshotModeToggleParams = Pick<
  UseToolbarModeControllerParams,
  | 'aiPickMode'
  | 'disableAiPickMode'
  | 'highlighterMode'
  | 'quickEditMode'
  | 'setAiPickMode'
  | 'setHighlighterMode'
  | 'setIsToolbarVisible'
  | 'setQuickEditDocumentMode'
  | 'setQuickEditMode'
  | 'setScreenshotMode'
>;

function disableSiblingModesForScreenshotToggle({
  aiPickMode,
  disableAiPickMode,
  highlighterMode,
  quickEditMode,
  setAiPickMode,
  setHighlighterMode,
  setQuickEditDocumentMode,
  setQuickEditMode,
}: Pick<
  ScreenshotModeToggleParams,
  | 'aiPickMode'
  | 'disableAiPickMode'
  | 'highlighterMode'
  | 'quickEditMode'
  | 'setAiPickMode'
  | 'setHighlighterMode'
  | 'setQuickEditDocumentMode'
  | 'setQuickEditMode'
>) {
  if (aiPickMode) {
    disableAiPickMode();
    setAiPickMode(false);
    logger.log('Disabled AI pick mode on screenshot mode exit');
  }

  if (highlighterMode) {
    disableHighlighterMode();
    setHighlighterMode(false);
    logger.log('Disabled highlighter mode on screenshot mode exit');
  }

  if (quickEditMode) {
    if (!resetQuickEditDocumentMode(setQuickEditDocumentMode)) {
      return false;
    }
    disableQuickEditMode();
    setQuickEditMode(false);
    logger.log('Disabled quick edit mode on screenshot mode exit');
  }

  return true;
}

function warmSelectionMode(): void {
  preloadSelectionMode().catch((error) => {
    logger.warn('Failed to preload selection mode chunk', error);
  });
}

function createCursorModeHandler({
  aiPickMode,
  disableAiPickMode,
  highlighterMode,
  quickEditMode,
  setAiPickMode,
  setHighlighterMode,
  setNavigationLockEnabled,
  setQuickEditDocumentMode,
  setQuickEditMode,
}: Pick<
  UseToolbarModeControllerParams,
  | 'aiPickMode'
  | 'disableAiPickMode'
  | 'highlighterMode'
  | 'quickEditMode'
  | 'setAiPickMode'
  | 'setHighlighterMode'
  | 'setNavigationLockEnabled'
  | 'setQuickEditDocumentMode'
  | 'setQuickEditMode'
>) {
  return () => {
    if (highlighterMode) {
      disableHighlighterMode();
      setHighlighterMode(false);
    }

    if (quickEditMode) {
      if (!resetQuickEditDocumentMode(setQuickEditDocumentMode)) {
        return;
      }
      disableQuickEditMode();
      setQuickEditMode(false);
    }

    if (aiPickMode) {
      disableAiPickMode();
      setAiPickMode(false);
    }

    setNavigationLockEnabled(false);
  };
}

function createScreenshotModeToggle({
  aiPickMode,
  disableAiPickMode,
  highlighterMode,
  quickEditMode,
  setAiPickMode,
  setHighlighterMode,
  setIsToolbarVisible,
  setQuickEditDocumentMode,
  setQuickEditMode,
  setScreenshotMode,
}: ScreenshotModeToggleParams) {
  return (enabled: boolean) => {
    if (!enabled) {
      const cleanupSucceeded = disableSiblingModesForScreenshotToggle({
        aiPickMode,
        disableAiPickMode,
        highlighterMode,
        quickEditMode,
        setAiPickMode,
        setHighlighterMode,
        setQuickEditDocumentMode,
        setQuickEditMode,
      });
      if (!cleanupSucceeded) {
        return;
      }
    }

    if (enabled) {
      warmSelectionMode();
    }

    setScreenshotMode(enabled);
    setIsToolbarVisible(enabled);
  };
}

function createHighlighterModeToggle({
  aiPickMode,
  disableAiPickMode,
  quickEditMode,
  setAiPickMode,
  setHighlighterMode,
  setQuickEditDocumentMode,
  setQuickEditMode,
}: Pick<
  UseToolbarModeControllerParams,
  | 'aiPickMode'
  | 'disableAiPickMode'
  | 'quickEditMode'
  | 'setAiPickMode'
  | 'setHighlighterMode'
  | 'setQuickEditDocumentMode'
  | 'setQuickEditMode'
>) {
  return (enabled: boolean) => {
    logger.log('handleToggleHighlighterMode called with', enabled);

    if (enabled && quickEditMode) {
      if (!resetQuickEditDocumentMode(setQuickEditDocumentMode)) {
        return;
      }
      disableQuickEditMode();
      setQuickEditMode(false);
      logger.log('Disabled quick edit mode due to highlighter activation');
    }

    if (enabled && aiPickMode) {
      disableAiPickMode();
      setAiPickMode(false);
      logger.log('Disabled AI pick mode due to highlighter activation');
    }

    setHighlighterMode(enabled);
    if (enabled) {
      logger.log('Enabling highlighter mode');
      enableHighlighterMode();
      return;
    }

    logger.log('Disabling highlighter mode');
    disableHighlighterMode();
  };
}

function createQuickEditModeToggle({
  aiPickMode,
  disableAiPickMode,
  setAiPickMode,
  setNavigationLockEnabled,
  setQuickEditDocumentMode,
  setQuickEditMode,
}: Pick<
  UseToolbarModeControllerParams,
  | 'aiPickMode'
  | 'disableAiPickMode'
  | 'setAiPickMode'
  | 'setNavigationLockEnabled'
  | 'setQuickEditDocumentMode'
  | 'setQuickEditMode'
>) {
  return (enabled: boolean) => {
    if (enabled && aiPickMode) {
      disableAiPickMode();
      setAiPickMode(false);
      logger.log('Disabled AI pick mode due to quick edit activation');
    }

    if (enabled) {
      setQuickEditMode(true);
      setQuickEditDocumentMode(false);
      enableQuickEditMode();
      setNavigationLockEnabled(true);
      return;
    }

    if (!resetQuickEditDocumentMode(setQuickEditDocumentMode)) {
      return;
    }
    disableQuickEditMode();
    setQuickEditMode(false);
    setNavigationLockEnabled(false);
  };
}

export function createToolbarEditingHandlers(params: ToolbarEditingParams) {
  return {
    handleEnableCursorMode: createCursorModeHandler(params),
    handleToggleHighlighterMode: createHighlighterModeToggle(params),
    handleToggleQuickEditDocumentMode: createQuickEditDocumentModeToggle(params),
    handleToggleQuickEditMode: createQuickEditModeToggle(params),
    handleToggleScreenshotMode: createScreenshotModeToggle(params),
  };
}
