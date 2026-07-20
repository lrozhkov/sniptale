import { dispatchHighlighterModeChanged as emitHighlighterModeChanged } from '../../platform/page-context/mode-events';
import { applyHighlighterDocumentMode } from './runtime-document-mode';
import { mountHighlighterCursorStyle, removeHighlighterCursorStyle } from './runtime-cursor-style';
import { registerHighlighterRuntimeListeners } from './runtime-listeners';

export function dispatchHighlighterModeChanged(enabled: boolean) {
  emitHighlighterModeChanged({ enabled });
}

export {
  applyHighlighterDocumentMode,
  mountHighlighterCursorStyle,
  removeHighlighterCursorStyle,
  registerHighlighterRuntimeListeners,
};
