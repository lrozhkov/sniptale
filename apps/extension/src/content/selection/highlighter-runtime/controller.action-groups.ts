import { createHighlighterControllerFrameStateActionGroup } from './controller.action-groups.frame-state';
import { createHighlighterControllerRuntimeActionGroup } from './controller.action-groups.runtime';
import type { HighlighterLogger, HoverController } from './controller.types';
import type { HighlighterRuntimeState } from './state';

export function createHighlighterControllerActionGroups(props: {
  hoverController: HoverController;
  logger: HighlighterLogger;
  runtimeDeps: Parameters<typeof createHighlighterControllerRuntimeActionGroup>[0]['runtimeDeps'];
  state: HighlighterRuntimeState;
}) {
  const runtimeActions = createHighlighterControllerRuntimeActionGroup({
    hoverController: props.hoverController,
    runtimeDeps: props.runtimeDeps,
    state: props.state,
  });
  const { frameActions, stateActions } = createHighlighterControllerFrameStateActionGroup({
    hoverController: props.hoverController,
    logger: props.logger,
    state: props.state,
  });

  return { frameActions, runtimeActions, stateActions };
}
