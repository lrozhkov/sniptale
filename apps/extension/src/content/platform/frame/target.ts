import { getIframeDocument, isIframeAccessible } from './core';

type PointerLikeEvent = Event & {
  clientX?: number;
  clientY?: number;
};

function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === 'object' && (node as Node).nodeType === Node.ELEMENT_NODE);
}

function isIframeElement(node: unknown): node is HTMLIFrameElement {
  return isElementNode(node) && (node as Element).tagName.toLowerCase() === 'iframe';
}

function getEventTargetElement(event: Event): Element | null {
  const pathTargets = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const pathTarget = pathTargets.find((node): node is Element => isElementNode(node));
  if (pathTarget) {
    return pathTarget;
  }

  return isElementNode(event.target) ? event.target : null;
}

function hasClientPoint(event: PointerLikeEvent): event is PointerLikeEvent & {
  clientX: number;
  clientY: number;
} {
  return typeof event.clientX === 'number' && typeof event.clientY === 'number';
}

function getDeepestAccessibleElementAtPoint(
  doc: Document,
  clientX: number,
  clientY: number
): Element | null {
  const pointTarget = doc.elementFromPoint(clientX, clientY);
  if (!isElementNode(pointTarget)) {
    return null;
  }

  if (!isIframeElement(pointTarget) || !isIframeAccessible(pointTarget)) {
    return pointTarget;
  }

  const iframeDoc = getIframeDocument(pointTarget);
  if (!iframeDoc) {
    return pointTarget;
  }

  const iframeRect = pointTarget.getBoundingClientRect();
  const nestedTarget = getDeepestAccessibleElementAtPoint(
    iframeDoc,
    clientX - iframeRect.left - pointTarget.clientLeft,
    clientY - iframeRect.top - pointTarget.clientTop
  );

  return nestedTarget ?? pointTarget;
}

export function resolveIframePointTarget(
  iframe: HTMLIFrameElement,
  clientX: number,
  clientY: number
): Element {
  if (!isIframeAccessible(iframe)) {
    return iframe;
  }

  const iframeDoc = getIframeDocument(iframe);
  if (!iframeDoc) {
    return iframe;
  }

  const iframeRect = iframe.getBoundingClientRect();
  return (
    getDeepestAccessibleElementAtPoint(
      iframeDoc,
      clientX - iframeRect.left - iframe.clientLeft,
      clientY - iframeRect.top - iframe.clientTop
    ) ?? iframe
  );
}

/**
 * Resolves the deepest accessible same-origin iframe target for a cross-document interaction.
 */
export function resolveIframeEventElement(
  event: Event,
  iframe?: HTMLIFrameElement
): Element | null {
  const target = getEventTargetElement(event);
  if (!target) {
    return null;
  }

  if (!hasClientPoint(event)) {
    return target;
  }

  if (iframe) {
    const iframeDoc = getIframeDocument(iframe);
    const iframeTarget = iframeDoc
      ? getDeepestAccessibleElementAtPoint(iframeDoc, event.clientX, event.clientY)
      : null;

    if (iframeTarget) {
      return iframeTarget;
    }
  }

  if (isIframeElement(target)) {
    return resolveIframePointTarget(target, event.clientX, event.clientY);
  }

  return target;
}

/** Retains the legacy HTML-only target contract for quick text editing. */
export function resolveIframeEventTarget(
  event: Event,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
  const element = resolveIframeEventElement(event, iframe);
  return element?.namespaceURI === 'http://www.w3.org/1999/xhtml' ? (element as HTMLElement) : null;
}
