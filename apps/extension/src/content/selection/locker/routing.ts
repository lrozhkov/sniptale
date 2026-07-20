import { isContentOwnedEvent } from '../../platform/dom-host';
import { isContentModeEnabled } from '../../application/mode-session';
import {
  blockEvent,
  getLockRoutingTarget,
  handleClosestLink,
  handleResolvedNavigationTarget,
  resolveLockTargets,
  shouldAllowQuickEditTarget,
  shouldBlockQuickEditInteractiveTarget,
} from './routing.guards';

interface LockRoutingState {
  isUIHidden: boolean;
  isNavigationLocked: boolean;
  isFullLockMode: boolean;
}

function handleFullLockInteractiveTarget(
  event: Event,
  interactiveTarget: HTMLElement | null,
  isFullLockMode: boolean
): void {
  if (!interactiveTarget) {
    return;
  }

  if (!(isFullLockMode || isContentModeEnabled('quick-edit'))) {
    return;
  }

  blockEvent(event);
}

export function routeLockInteractionEvent(event: Event, state: LockRoutingState): void {
  if (state.isUIHidden) {
    return;
  }
  if (!state.isNavigationLocked) {
    return;
  }
  if (isContentOwnedEvent(event)) {
    return;
  }

  const target = getLockRoutingTarget(event);
  if (!target) {
    return;
  }

  const { interactiveTarget, navigationTarget } = resolveLockTargets(event);
  if (shouldAllowQuickEditTarget(target)) {
    return;
  }

  if (shouldBlockQuickEditInteractiveTarget(event)) {
    return;
  }

  if (target.classList.contains('sniptale-editing') || target.isContentEditable) {
    return;
  }

  if (handleResolvedNavigationTarget(event, navigationTarget)) {
    return;
  }

  if (handleClosestLink(event, target)) {
    return;
  }

  handleFullLockInteractiveTarget(event, interactiveTarget, state.isFullLockMode);
}
