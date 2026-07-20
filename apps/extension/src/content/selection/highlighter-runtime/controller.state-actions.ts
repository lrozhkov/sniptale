import { setHighlighterTooltipVisibility } from './runtime-state.helpers';
import type { HighlighterLogger, HoverController } from './controller.types';
import type { HighlighterRuntimeState } from './state';

export function createHighlighterStateActions(props: {
  hoverController: HoverController;
  logger: HighlighterLogger;
  state: HighlighterRuntimeState;
}) {
  return {
    clearFrameEditing: () => {
      props.state.isFrameEditing = false;
      props.logger.log('Frame editing cleared');
    },
    clearFrameTooltipVisible: () => {
      setHighlighterTooltipVisibility(props.state, false, props.hoverController);
    },
    isEnabled: () => props.state.isModeEnabled,
    isFrameTooltipVisible: () => props.state.isTooltipVisible,
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
      props.state.isFrameEditing = true;
      props.logger.log('Frame editing started');
    },
    setFrameTooltipVisible: () => {
      setHighlighterTooltipVisibility(props.state, true, props.hoverController);
    },
  };
}
