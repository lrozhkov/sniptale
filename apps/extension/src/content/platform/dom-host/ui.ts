import {
  CONTENT_APP_CONTAINER_ID,
  CONTENT_OVERLAY_ROOT_ID,
  CONTENT_ROOT_ID,
} from '@sniptale/ui/branding';
import { initializeContentUiRoots } from './ui-roots';
import {
  getComposedEventTargetElement,
  isComposedEventWithinAnyElement,
  isComposedEventWithinElement,
} from '@sniptale/ui/dom-events';

export { initializeContentUiRoots };

type ContentUiSurface = 'app' | 'overlay';
type ContentEventLike = Pick<Event, 'target'> & {
  composedPath?: () => EventTarget[];
};

function resolveContentHost(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.getElementById(CONTENT_ROOT_ID);
}

/**
 * Returns the live content-script shadow root when the content runtime has bootstrapped.
 */
export function resolveContentShadowRoot(): ShadowRoot | null {
  return resolveContentHost()?.shadowRoot ?? null;
}

/**
 * Returns true when a node belongs to the extension-owned content runtime surface.
 */
export function isContentOwnedElement(node: Node | null): boolean {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.id === CONTENT_ROOT_ID) {
    return true;
  }

  const shadowRoot = resolveContentShadowRoot();
  return Boolean(shadowRoot && node.getRootNode() === shadowRoot);
}

function getContentEventPathTargets(event: ContentEventLike): EventTarget[] {
  if (typeof event.composedPath === 'function') {
    return event.composedPath();
  }

  return event.target ? [event.target] : [];
}

/**
 * Returns true when an event flowed through the extension-owned content UI surface.
 */
export function isContentOwnedEvent(event: ContentEventLike): boolean {
  const shadowRoot = resolveContentShadowRoot();
  return getContentEventPathTargets(event).some((target) => {
    if (
      typeof ShadowRoot !== 'undefined' &&
      target instanceof ShadowRoot &&
      target === shadowRoot
    ) {
      return true;
    }

    return target instanceof Node && isContentOwnedElement(target);
  });
}

/**
 * Resolves the real element target from the composed event path so document-level listeners keep
 * seeing the interacted control after events cross the content shadow boundary.
 */
export function getContentEventTargetElement(event: ContentEventLike): HTMLElement | null {
  return getComposedEventTargetElement(event);
}

/**
 * Returns true when the composed event path flows through the provided element.
 */
export function isContentEventWithinElement(
  event: ContentEventLike,
  element: Element | null
): boolean {
  return isComposedEventWithinElement(event, element);
}

/**
 * Returns true when the composed event path flows through any provided element.
 */
export function isContentEventWithinAnyElement(
  event: ContentEventLike,
  elements: Iterable<Element | null>
): boolean {
  return isComposedEventWithinAnyElement(event, elements);
}

/**
 * Resolves the content-owned app container when available.
 */
export function resolveContentAppContainer(): HTMLDivElement | null {
  return (
    (resolveContentShadowRoot()?.getElementById(
      CONTENT_APP_CONTAINER_ID
    ) as HTMLDivElement | null) ?? null
  );
}

/**
 * Resolves the canonical content-owned overlay root when available.
 */
export function resolveContentOverlayRoot(): HTMLDivElement | null {
  return (
    (resolveContentShadowRoot()?.getElementById(
      CONTENT_OVERLAY_ROOT_ID
    ) as HTMLDivElement | null) ?? null
  );
}

/**
 * Resolves the current mount target for content-owned UI. Tests can fall back to `document.body`
 * before the real content runtime bootstraps.
 */
export function resolveContentUiMountTarget(surface: ContentUiSurface = 'overlay'): HTMLElement {
  const ownedTarget =
    surface === 'overlay' ? resolveContentOverlayRoot() : resolveContentAppContainer();
  if (ownedTarget) {
    return ownedTarget;
  }

  return document.body ?? document.documentElement;
}

/**
 * Appends a node to the canonical content overlay root, falling back only when the content
 * runtime has not been initialized yet.
 */
export function appendToContentOverlayRoot<T extends Node>(node: T): T {
  resolveContentUiMountTarget('overlay').appendChild(node);
  return node;
}

/**
 * Looks up an owned content element inside the shadow tree before falling back to light-DOM
 * legacy locations used by isolated unit tests.
 */
export function getContentUiElementById<T extends HTMLElement = HTMLElement>(id: string): T | null {
  const shadowMatch = resolveContentShadowRoot()?.getElementById(id);
  if (shadowMatch instanceof HTMLElement) {
    return shadowMatch as T;
  }

  const documentMatch = document.getElementById(id);
  return documentMatch instanceof HTMLElement ? (documentMatch as T) : null;
}

/**
 * Queries the content shadow tree first so extension-owned UI can be resolved after the shadow
 * migration without breaking older tests that still mount into `document.body`.
 */
export function queryContentUiElement<T extends Element = HTMLElement>(selector: string): T | null {
  const shadowMatch = resolveContentShadowRoot()?.querySelector<T>(selector);
  if (shadowMatch) {
    return shadowMatch;
  }

  return document.querySelector<T>(selector);
}

/**
 * Queries all matching content-owned elements across the shadow tree and any fallback light-DOM
 * mounts that might still exist in unit tests.
 */
export function queryAllContentUiElements<T extends Element = HTMLElement>(selector: string): T[] {
  const shadowRoot = resolveContentShadowRoot();
  const shadowMatches = shadowRoot ? Array.from(shadowRoot.querySelectorAll<T>(selector)) : [];
  const documentMatches = Array.from(document.querySelectorAll<T>(selector));
  const seen = new Set<Element>();

  return [...shadowMatches, ...documentMatches].filter((element) => {
    if (seen.has(element)) {
      return false;
    }

    seen.add(element);
    return true;
  });
}
