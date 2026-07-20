type HostPageClickBlockReason = 'detached' | 'disabled' | 'inert' | 'navigation-prone-anchor';

function isDisabledElement(element: HTMLElement): boolean {
  return 'disabled' in element && Boolean(element.disabled);
}

function hasDisabledAriaState(element: HTMLElement): boolean {
  return element.getAttribute('aria-disabled') === 'true';
}

function hasInertAncestor(element: HTMLElement): boolean {
  return element.closest('[inert]') !== null;
}

function hasNavigationProneAnchor(element: HTMLElement): boolean {
  const anchor = element.closest('a[href]');
  return anchor instanceof HTMLAnchorElement && !anchor.hasAttribute('download');
}

export function getHostPageClickBlockReason(element: HTMLElement): HostPageClickBlockReason | null {
  if (!element.isConnected) {
    return 'detached';
  }

  if (hasInertAncestor(element)) {
    return 'inert';
  }

  if (isDisabledElement(element) || hasDisabledAriaState(element)) {
    return 'disabled';
  }

  if (hasNavigationProneAnchor(element)) {
    return 'navigation-prone-anchor';
  }

  return null;
}

/**
 * Clicks a host-page control only when it is still connected and not likely to navigate away.
 */
export function clickHostPageElement(element: HTMLElement): {
  clicked: boolean;
  reason: HostPageClickBlockReason | null;
} {
  const reason = getHostPageClickBlockReason(element);
  if (reason) {
    return { clicked: false, reason };
  }

  element.click();
  return { clicked: true, reason: null };
}
