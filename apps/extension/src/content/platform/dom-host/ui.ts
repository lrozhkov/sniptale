import { CONTENT_APP_CONTAINER_ID, CONTENT_OVERLAY_ROOT_ID } from '@sniptale/ui/branding';
import {
  initializeContentUiRoots,
  isContentUiBootstrapFallbackAllowed,
  resolveInitializedContentShadowRoot,
} from './ui-roots';
import {
  getComposedEventTargetElement,
  isComposedEventWithinAnyElement,
  isComposedEventWithinElement,
} from '@sniptale/ui/dom-events';

export { initializeContentUiRoots };
export { isContentUiBootstrapFallbackAllowed };

type ContentUiSurface = 'app' | 'overlay';
type ContentEventLike = Pick<Event, 'target'> & {
  composedPath?: () => EventTarget[];
};

const failClosedMountTargets = new Map<ContentUiSurface, HTMLElement>();

function resolveContentHost(): Element | null {
  return resolveInitializedContentShadowRoot()?.host ?? null;
}

/**
 * Mirrors runtime visibility state onto the Shadow DOM host so owned styles can cross the host
 * boundary without depending on light-DOM ancestor selectors.
 */
export function toggleContentHostClass(className: string, enabled: boolean): void {
  resolveContentHost()?.classList.toggle(className, enabled);
}

/**
 * Returns the live content-script shadow root when the content runtime has bootstrapped.
 */
export function resolveContentShadowRoot(): ShadowRoot | null {
  return resolveInitializedContentShadowRoot();
}

/**
 * Returns true when a node belongs to the extension-owned content runtime surface.
 */
export function isContentOwnedElement(node: Node | null): boolean {
  if (!node) {
    return false;
  }

  const shadowRoot = resolveContentShadowRoot();
  return Boolean(shadowRoot && (node === shadowRoot.host || node.getRootNode() === shadowRoot));
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
export function ensureContentUiMountTarget(surface: ContentUiSurface = 'overlay'): HTMLElement {
  const shadowRoot = resolveContentShadowRoot();
  const ownedTarget =
    surface === 'overlay' ? resolveContentOverlayRoot() : resolveContentAppContainer();
  if (ownedTarget) {
    return ownedTarget;
  }

  if (shadowRoot) {
    const roots = initializeContentUiRoots(shadowRoot);
    return surface === 'overlay' ? roots.overlayRoot : roots.appContainer;
  }

  if (isContentUiBootstrapFallbackAllowed()) {
    return document.body ?? document.documentElement;
  }

  let failClosedTarget = failClosedMountTargets.get(surface);
  if (!failClosedTarget || failClosedTarget.ownerDocument !== document) {
    // why: after a registered host retires, extension UI must never mount into page-owned DOM.
    failClosedTarget = document.createElement('div');
    failClosedMountTargets.set(surface, failClosedTarget);
  }
  return failClosedTarget;
}

/**
 * Appends a node to the canonical content overlay root, falling back only when the content
 * runtime has not been initialized yet.
 */
export function appendToContentOverlayRoot<T extends Node>(node: T): T {
  ensureContentUiMountTarget('overlay').appendChild(node);
  return node;
}

/**
 * Looks up an owned content element in the exact registered shadow tree. Isolated tests may use
 * the light DOM only before content-root initialization.
 */
export function getContentUiElementById<T extends HTMLElement = HTMLElement>(id: string): T | null {
  const shadowRoot = resolveContentShadowRoot();
  if (shadowRoot) {
    const shadowMatch = shadowRoot.getElementById(id);
    return shadowMatch instanceof HTMLElement ? (shadowMatch as T) : null;
  }

  if (!isContentUiBootstrapFallbackAllowed()) {
    return null;
  }

  const documentMatch = document.getElementById(id);
  return documentMatch instanceof HTMLElement ? (documentMatch as T) : null;
}

/**
 * Queries the exact registered content shadow tree, with a pre-initialization light-DOM fallback
 * for isolated tests.
 */
export function queryContentUiElement<T extends Element = HTMLElement>(selector: string): T | null {
  const shadowRoot = resolveContentShadowRoot();
  if (shadowRoot) {
    return shadowRoot.querySelector<T>(selector);
  }

  if (!isContentUiBootstrapFallbackAllowed()) {
    return null;
  }

  return document.querySelector<T>(selector);
}

/**
 * Queries all matching elements in the exact registered content shadow tree, or a pre-bootstrap
 * light-DOM test mount when no registered root is available.
 */
export function queryAllContentUiElements<T extends Element = HTMLElement>(selector: string): T[] {
  const shadowRoot = resolveContentShadowRoot();
  if (shadowRoot) {
    return Array.from(shadowRoot.querySelectorAll<T>(selector));
  }

  return isContentUiBootstrapFallbackAllowed()
    ? Array.from(document.querySelectorAll<T>(selector))
    : [];
}
