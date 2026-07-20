import { isContentOwnedElement } from '../../../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../../../platform/frame';
import { isAiPickPassThroughUiElement } from './passthrough';
import {
  isAiPickShadowScaffoldElement,
  logAiPickShadowPierceMiss,
  resolveAiPickShadowPointTarget,
} from './shadow';
import { resolveAiPickUnderlyingTarget } from './underlying';

/**
 * Resolves the effective target for AI-pick after shadow retargeting and frame overlay ownership.
 */
export function resolveAiPickInteractionTarget(
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const target = resolveIframeEventTarget(event, iframe);
  if (!target) {
    return null;
  }

  const shadowTarget = isContentOwnedElement(target) ? resolveAiPickShadowPointTarget(event) : null;
  const resolvedTarget = shadowTarget ?? target;

  if (
    !isAiPickPassThroughUiElement(resolvedTarget) &&
    !isAiPickShadowScaffoldElement(resolvedTarget)
  ) {
    return resolvedTarget;
  }

  const underlyingTarget = resolveAiPickUnderlyingTarget(event, resolvedTarget);
  if (underlyingTarget) {
    return underlyingTarget;
  }

  if (isAiPickShadowScaffoldElement(resolvedTarget)) {
    logAiPickShadowPierceMiss(event, resolvedTarget);
  }

  return resolvedTarget;
}
