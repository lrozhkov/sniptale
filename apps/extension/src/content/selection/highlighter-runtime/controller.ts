import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createHighlighterHoverController,
  logAccessibleIframeCount,
} from '../highlighter-hover-preview';
import {
  createHighlighterFrameActions,
  createHighlighterInvalidateActions,
  createHighlighterRuntimeActions,
  createHighlighterStateActions,
} from './controller.actions';
import type { HighlighterController, HighlighterControllerDeps } from './controller.types';
import { disableHighlighterRuntime, enableHighlighterRuntime } from './mode';
import {
  createHighlighterCallbacks,
  createHighlighterRuntimeState,
  createHighlighterStateGetters,
} from './state';

function assembleHighlighterController(deps: HighlighterControllerDeps): HighlighterController {
  const state = deps.createState?.() ?? createHighlighterRuntimeState();
  const hoverController =
    deps.createHoverController?.(
      createHighlighterCallbacks(state),
      createHighlighterStateGetters(state)
    ) ??
    createHighlighterHoverController(
      createHighlighterCallbacks(state),
      createHighlighterStateGetters(state)
    );
  const logger = deps.logger ?? createLogger({ namespace: 'ContentHighlighter' });
  const sharedActionProps = { hoverController, logger, state };

  return {
    ...createHighlighterInvalidateActions(hoverController),
    ...createHighlighterRuntimeActions({
      disableRuntime: deps.disableRuntime ?? disableHighlighterRuntime,
      enableRuntime: deps.enableRuntime ?? enableHighlighterRuntime,
      hoverController,
      logIframeCount: deps.logAccessibleIframeCount ?? logAccessibleIframeCount,
      state,
    }),
    ...createHighlighterFrameActions(sharedActionProps),
    ...createHighlighterStateActions(sharedActionProps),
  };
}

/**
 * Creates a highlighter controller with instance-owned runtime state and hover controller wiring.
 */
export function createHighlighterController(
  deps: HighlighterControllerDeps = {}
): HighlighterController {
  return assembleHighlighterController(deps);
}
