import { resolveAiPickInteractionTarget } from '../interaction-target';
import type { AiPickModeState } from '../mode.types';

export function resolveScopedAiPickTarget(
  state: AiPickModeState,
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const target = resolveAiPickInteractionTarget(event, iframe);
  if (!target || (state.source?.acceptsTarget && !state.source.acceptsTarget(target))) {
    return null;
  }

  return target;
}

export function resolveEnabledAiPickTarget(
  state: AiPickModeState,
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  if (!state.isEnabled) {
    return null;
  }

  return resolveScopedAiPickTarget(state, event, iframe);
}
