import {
  resolveHighlighterRuntimeDeps,
  type HighlighterController,
  type HighlighterControllerDeps,
} from './controller.helpers';
import { createHighlighterControllerActionGroups } from './controller.action-groups';
import { createHighlighterControllerHoverController } from './controller.hover';
import { createHighlighterControllerState } from './controller.state';
import { createHighlighterControllerInvalidateCallbacks } from './controller.invalidate';

export function createHighlighterControllerBindings(
  deps: HighlighterControllerDeps = {}
): HighlighterController {
  const state = createHighlighterControllerState(deps);
  const runtimeDeps = resolveHighlighterRuntimeDeps(deps);
  const hoverController = createHighlighterControllerHoverController(deps, state);
  const actionGroups = createHighlighterControllerActionGroups({
    hoverController,
    logger: runtimeDeps.logger,
    runtimeDeps,
    state,
  });
  const invalidateCallbacks = createHighlighterControllerInvalidateCallbacks(hoverController);

  return {
    ...invalidateCallbacks,
    ...actionGroups.runtimeActions,
    ...actionGroups.frameActions,
    ...actionGroups.stateActions,
  };
}
