import {
  addHighlighterFrame,
  clearHighlighterFrames,
  registerHighlighterFrameCallbacks,
  removeHighlighterFrame,
} from './callbacks';
import { resetHighlighterHoverUi } from './runtime-state.helpers';
import type { HighlighterLogger, HoverController } from './controller.types';
import type { HighlighterRuntimeState } from './state';

export function createHighlighterFrameActions(props: {
  hoverController: HoverController;
  logger: HighlighterLogger;
  state: HighlighterRuntimeState;
}) {
  return {
    addHighlight: (element: HTMLElement) => {
      props.hoverController.createOverlayContainer();
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
      removeFrame: (frameId: string) => void,
      clearFrames: () => void,
      hasFrameForElement?: (element: HTMLElement) => boolean
    ) => {
      registerHighlighterFrameCallbacks(props.state, {
        addFrame,
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
