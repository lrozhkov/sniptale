import { createHighlighterControllerBindings } from './controller.bindings';
import type { HighlighterController, HighlighterControllerDeps } from './controller.helpers';

/**
 * Creates a highlighter controller with instance-owned runtime state and hover controller wiring.
 */
export function createHighlighterController(
  deps: HighlighterControllerDeps = {}
): HighlighterController {
  return createHighlighterControllerBindings(deps);
}
