import type { ContentAppRuntimeModeControls } from '../../app/content-mode';

export interface UseToolbarModeControllerParams extends ContentAppRuntimeModeControls {
  aiPickMode: boolean;
  disableAiPickMode: () => void;
  highlighterMode: boolean;
  quickEditMode: boolean;
}

export interface UseToolbarModeControllerResult {
  handleClearHighlights: () => void;
  handleEnableCursorMode: () => void;
  handleHideToolbar: () => void;
  handleToggleHighlighterMode: (enabled: boolean) => void;
  handleToggleNavigationLock: (enabled: boolean) => void;
  handleToggleQuickEditDocumentMode: (enabled: boolean) => void;
  handleToggleQuickEditMode: (enabled: boolean) => void;
  handleToggleScreenshotMode: (enabled: boolean) => void;
}
