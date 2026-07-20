import { createHighlighterHoverController } from '../highlighter-hover-preview';
import {
  createHighlighterCallbacks,
  createHighlighterStateGetters,
  type HighlighterControllerDeps,
} from './controller.helpers';
import type { HighlighterRuntimeState } from './state';

export function createHighlighterControllerHoverController(
  deps: HighlighterControllerDeps,
  state: HighlighterRuntimeState
) {
  const callbacks = createHighlighterCallbacks(state);
  const getters = createHighlighterStateGetters(state);

  return (
    deps.createHoverController?.(callbacks, getters) ??
    createHighlighterHoverController(callbacks, getters)
  );
}
