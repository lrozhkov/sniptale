import type { UseToolbarModeControllerParams, UseToolbarModeControllerResult } from './types';
import { createToolbarEditingHandlers } from './editing';
import { createToolbarStaticHandlers } from './static';

export function useToolbarModeController({
  aiPickMode,
  disableAiPickMode,
  highlighterMode,
  quickEditMode,
  setAiPickMode,
  setHighlighterMode,
  setIsToolbarVisible,
  setNavigationLockEnabled,
  setQuickEditDocumentMode,
  setQuickEditMode,
  setScreenshotMode,
}: UseToolbarModeControllerParams): UseToolbarModeControllerResult {
  const editingHandlers = createToolbarEditingHandlers({
    aiPickMode,
    disableAiPickMode,
    highlighterMode,
    quickEditMode,
    setAiPickMode,
    setHighlighterMode,
    setIsToolbarVisible,
    setNavigationLockEnabled,
    setQuickEditDocumentMode,
    setQuickEditMode,
    setScreenshotMode,
  });
  const staticHandlers = createToolbarStaticHandlers(setIsToolbarVisible, setNavigationLockEnabled);

  return buildToolbarModeController({
    handleClearHighlights: staticHandlers.handleClearHighlights,
    handleEnableCursorMode: editingHandlers.handleEnableCursorMode,
    handleHideToolbar: staticHandlers.handleHideToolbar,
    handleToggleHighlighterMode: editingHandlers.handleToggleHighlighterMode,
    handleToggleNavigationLock: staticHandlers.handleToggleNavigationLock,
    handleToggleQuickEditDocumentMode: editingHandlers.handleToggleQuickEditDocumentMode,
    handleToggleQuickEditMode: editingHandlers.handleToggleQuickEditMode,
    handleToggleScreenshotMode: editingHandlers.handleToggleScreenshotMode,
  });
}

function buildToolbarModeController(handlers: UseToolbarModeControllerResult) {
  return handlers;
}
