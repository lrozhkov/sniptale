import { createHighlighterFrameActions, createHighlighterStateActions } from './controller.helpers';
import type { HighlighterLogger, HoverController } from './controller.types';
import type { HighlighterRuntimeState } from './state';

export function createHighlighterControllerFrameStateActionGroup(props: {
  hoverController: HoverController;
  logger: HighlighterLogger;
  state: HighlighterRuntimeState;
}) {
  const frameActions = createHighlighterFrameActions({
    hoverController: props.hoverController,
    logger: props.logger,
    state: props.state,
  });
  const stateActions = createHighlighterStateActions({
    hoverController: props.hoverController,
    logger: props.logger,
    state: props.state,
  });

  return { frameActions, stateActions };
}
