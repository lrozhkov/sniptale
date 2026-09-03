import { deactivateOtherContentModes, setContentModeEnabled } from '../../application/mode-session';
import {
  dispatchFrameEditingChanged,
  dispatchHighlighterModeChanged as emitHighlighterModeChanged,
} from '../../platform/page-context/mode-events';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import type { HoverController } from '../highlighter-hover-preview';
import { mountHighlighterCursorStyle, removeHighlighterCursorStyle } from './runtime-cursor-style';
import { applyHighlighterDocumentMode } from './runtime-document-mode';
import { registerHighlighterRuntimeListeners } from './runtime-listeners';
import { resetHighlighterHoverUi, type HighlighterRuntimeState } from './state';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentHighlighter:EnableTiming' });

function measureEnableStep(
  timings: Record<string, number>,
  name: string,
  action: () => void
): void {
  const startedAt = performance.now();
  action();
  timings[name] = Math.round((performance.now() - startedAt) * 10) / 10;
}

function dispatchHighlighterModeChanged(enabled: boolean) {
  emitHighlighterModeChanged({ enabled });
}

export function enableHighlighterRuntime(
  state: HighlighterRuntimeState,
  hoverController: HoverController
): void {
  if (state.isModeEnabled) {
    return;
  }

  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  measureEnableStep(timings, 'modeState', () => {
    deactivateOtherContentModes('highlighter');
    state.isModeEnabled = true;
    state.isCreationEnabled = true;
    setContentModeEnabled('highlighter', true);
    dispatchHighlighterModeChanged(true);
  });

  measureEnableStep(timings, 'overlay', () => {
    hoverController.overlay.createContainer();
    hoverController.overlay.createPreview();
  });
  measureEnableStep(timings, 'documentMode', () => applyHighlighterDocumentMode(true));
  measureEnableStep(timings, 'cursorStyles', mountHighlighterCursorStyle);
  let cleanupRuntimeListeners: () => void = () => undefined;
  measureEnableStep(timings, 'listeners', () => {
    cleanupRuntimeListeners = registerHighlighterRuntimeListeners({
      disableHighlighterMode: () => disableHighlighterRuntime(state, hoverController),
      hasActivePopover: () => useFrameUIStore.getState().activePopover !== null,
      hoverController,
      isAnyFrameEditing: () => state.isFrameEditing,
    });
  });
  state.cleanupEventListeners = cleanupRuntimeListeners;
  logger.log('Highlighter enable completed', {
    totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
    stepsMs: timings,
  });
}

export function disableHighlighterRuntime(
  state: HighlighterRuntimeState,
  hoverController: HoverController
): void {
  if (!state.isModeEnabled) {
    return;
  }

  state.isModeEnabled = false;
  state.isCreationEnabled = true;
  state.isPaused = false;
  if (state.isFrameEditing) {
    state.isFrameEditing = false;
    dispatchFrameEditingChanged({ active: false });
  }
  setContentModeEnabled('highlighter', false);
  useFrameUIStore.getState().dismissFrameUi();
  hoverController.tracking.cancelPendingFrame();
  hoverController.tracking.clear();
  dispatchHighlighterModeChanged(false);

  state.cleanupEventListeners?.();
  state.cleanupEventListeners = null;

  resetHighlighterHoverUi(hoverController);
  applyHighlighterDocumentMode(false);
  removeHighlighterCursorStyle();
}
