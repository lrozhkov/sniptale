import { getContentEventTargetElement } from '../../platform/dom-host';
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

  if (!(target.tagName.toLowerCase() === 'a' && target.hasAttribute('href'))) {
    return true;
  }

  return false;
}

export function shouldBlockQuickEditInteractiveTarget(event: Event) {
  const interactiveTarget = findClosestInteractiveElementForLock(getLockEventElements(event));
  if (!isContentModeEnabled('quick-edit') || !interactiveTarget) {
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
  if (isContentModeEnabled('ai-pick')) {
    return true;
  }
  if (isContentModeEnabled('selection-mode')) {
    return true;
  }
  if (isContentModeEnabled('highlighter')) {
    return true;
  }
  return false;
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

  blockEvent(event);
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

  blockEvent(event);
  return true;
}

function handleNavigationLink(event: Event, link: HTMLAnchorElement): boolean {
  const fullHref = link.href;
  const hrefAttr = link.getAttribute('href');
  if (
    (fullHref && isGwtInternalTabLink(fullHref)) ||
    (hrefAttr && isGwtInternalTabLink(hrefAttr))
  ) {
    return true;
  }

  blockEvent(event);
  return true;
}
