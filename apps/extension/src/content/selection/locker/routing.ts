import { getContentEventTargetElement, isContentOwnedEvent } from '../../platform/dom-host';
import { isContentModeEnabled } from '../../application/mode-session';
import {
  findClosestInteractiveElementForLock,
  findClosestNavigationTargetForLock,
  getLockEventElements,
  isGwtInternalTabLink,
  isTextElementForQuickEditLock,
} from './helpers';

export function shouldAllowQuickEditTarget(target: HTMLElement) {
  if (!isContentModeEnabled('quick-edit') || !isTextElementForQuickEditLock(target)) {
    return false;
  }

  return !(target.tagName.toLowerCase() === 'a' && target.hasAttribute('href'));
}

export function shouldBlockQuickEditInteractiveTarget(event: Event) {
  const interactiveTarget = findClosestInteractiveElementForLock(getLockEventElements(event));
  if (!isContentModeEnabled('quick-edit') || !interactiveTarget) {
    return false;
  }

  if (isTextElementForQuickEditLock(interactiveTarget)) {
    return false;
  }

  blockEvent(event);
  return true;
}

export function resolveLockTargets(event: Event) {
  const eventElements = getLockEventElements(event);
  return {
    interactiveTarget: findClosestInteractiveElementForLock(eventElements),
    navigationTarget: findClosestNavigationTargetForLock(eventElements),
  };
}

export function isSelectionDelegatedMode(): boolean {
  return (
    isContentModeEnabled('ai-pick') ||
    isContentModeEnabled('selection-mode') ||
    isContentModeEnabled('highlighter') ||
    isContentModeEnabled('design-review')
  );
}

export function isPageElementPickerActive(): boolean {
  return (
    isContentModeEnabled('design-review') ||
    isContentModeEnabled('highlighter') ||
    isContentModeEnabled('quick-edit')
  );
}

export function handleResolvedNavigationTarget(
  event: Event,
  navigationTarget: HTMLElement | null
): boolean {
  if (navigationTarget instanceof HTMLAnchorElement) {
    if (handleQuickEditLink(event, navigationTarget)) {
      return true;
    }

    return handleNavigationLink(event, navigationTarget);
  }

  if (!navigationTarget) {
    return false;
  }

  blockNavigationEvent(event);
  return true;
}

export function handleClosestLink(event: Event, target: HTMLElement): boolean {
  const closestLink = target.closest('a');
  if (!(closestLink instanceof HTMLAnchorElement)) {
    return false;
  }

  if (handleQuickEditLink(event, closestLink)) {
    return true;
  }

  return handleNavigationLink(event, closestLink);
}

export function blockEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/**
 * Blocks host-page navigation while allowing the active page-element picker listener on
 * the same capture target to observe the event and select the underlying element.
 */
export function blockNavigationEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  if (!isPageElementPickerActive()) {
    event.stopImmediatePropagation();
  }
}

export function getLockRoutingTarget(event: Event): HTMLElement | null {
  return getContentEventTargetElement(event);
}

function handleQuickEditLink(event: Event, link: HTMLAnchorElement): boolean {
  if (!isContentModeEnabled('quick-edit')) {
    return false;
  }

  const hasHref = link.hasAttribute('href') && link.getAttribute('href');
  if (!hasHref) {
    return true;
  }

  blockNavigationEvent(event);
  return true;
}

function handleNavigationLink(event: Event, link: HTMLAnchorElement): boolean {
  const fullHref = link.href;
  const hrefAttr = link.getAttribute('href');
  if (
    (fullHref && isGwtInternalTabLink(fullHref)) ||
    (hrefAttr && isGwtInternalTabLink(hrefAttr))
  ) {
    if (isPageElementPickerActive()) {
      blockNavigationEvent(event);
    }
    return true;
  }

  blockNavigationEvent(event);
  return true;
}

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

  if (isPageElementPickerActive()) {
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
