import { createHighlighterRuntimeState } from './state';
import type { HighlighterControllerDeps } from './controller.helpers';

export function createHighlighterControllerState(deps: HighlighterControllerDeps = {}) {
  return deps.createState?.() ?? createHighlighterRuntimeState();
}
