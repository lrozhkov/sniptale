import type { HighlighterLogger, HoverController } from './controller.types';
import { dispatchFrameEditingChanged } from '../../platform/page-context/mode-events';
import {
  addHighlighterFrame,
  clearHighlighterFrames,
  registerHighlighterFrameCallbacks,
  removeHighlighterFrame,
  resetHighlighterHoverUi,
  type HighlighterRuntimeState,
} from './state';

export function createHighlighterRuntimeActions(props: {
  disableRuntime: (state: HighlighterRuntimeState, hoverController: HoverController) => void;
  enableRuntime: (state: HighlighterRuntimeState, hoverController: HoverController) => void;
  hoverController: HoverController;
  logIframeCount: () => void;
  state: HighlighterRuntimeState;
}) {
  return {
    disableMode: () => {
      props.disableRuntime(props.state, props.hoverController);
    },
    dispose: () => {
      props.disableRuntime(props.state, props.hoverController);
      resetHighlighterHoverUi(props.hoverController);
    },
    enableMode: () => {
      props.enableRuntime(props.state, props.hoverController);
      props.logIframeCount();
    },
  };
}

export function createHighlighterFrameActions(props: {
  hoverController: HoverController;
  logger: HighlighterLogger;
  state: HighlighterRuntimeState;
}) {
  return {
    addHighlight: (element: HTMLElement) => {
      props.hoverController.overlay.createContainer();
      if (!addHighlighterFrame(props.state, element)) {
        props.logger.warn('Cannot add highlight before frame callbacks are registered');
      }
    },
    clearAllHighlights: () => {
      if (!clearHighlighterFrames(props.state)) {
        props.logger.warn('Cannot clear highlights before frame callbacks are registered');
      }

      resetHighlighterHoverUi(props.hoverController);
      props.logger.log('All highlights cleared');
    },
    registerFrameCallbacks: (
      addFrame: (element: HTMLElement) => void,
      addFreeFrame: import('../../../features/highlighter/contracts').AddFreeFrameCallback,
      removeFrame: (frameId: string) => void,
      clearFrames: () => void,
      hasFrameForElement?: (element: HTMLElement) => boolean
    ) => {
      registerHighlighterFrameCallbacks(props.state, {
        addFrame,
        addFreeFrame,
        removeFrame,
        clearFrames,
        ...(hasFrameForElement === undefined ? {} : { hasFrameForElement }),
      });
      props.logger.log('Frame callbacks registered');
    },
    removeHighlight: (id: string) => {
      if (!removeHighlighterFrame(props.state, id)) {
        props.logger.warn('Cannot remove highlight before frame callbacks are registered');
      }
    },
  };
}

export function createHighlighterStateActions(props: {
  hoverController: HoverController;
  logger: HighlighterLogger;
  state: HighlighterRuntimeState;
}) {
  return {
    clearFrameEditing: () => {
      if (!props.state.isFrameEditing) return;
      props.state.isFrameEditing = false;
      dispatchFrameEditingChanged({ active: false });
      props.logger.log('Frame editing cleared');
    },
    isEnabled: () => props.state.isModeEnabled,
    isFrameEditing: () => props.state.isFrameEditing,
    isPausedState: () => props.state.isPaused,
    pause: () => {
      props.state.isPaused = true;
      props.logger.log('Highlighter paused');
    },
    resume: () => {
      props.state.isPaused = false;
      props.logger.log('Highlighter resumed');
    },
    setFrameEditing: () => {
      if (props.state.isFrameEditing) return;
      props.state.isFrameEditing = true;
      dispatchFrameEditingChanged({ active: true });
      props.logger.log('Frame editing started');
    },
  };
}

export function createHighlighterInvalidateActions(
  hoverController: Pick<HoverController, 'invalidation'>
) {
  return {
    invalidateFrameCache: () => {
      hoverController.invalidation.frameCache();
    },
  };
}

export function createHighlighterInputActions(hoverController: Pick<HoverController, 'input'>) {
  return {
    consumeSuppressedClick: (event: MouseEvent) =>
      hoverController.input.consumeSuppressedClick(event),
  };
}
