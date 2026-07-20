import { getIframeDocument, isIframeAccessible } from './core';

type PointerLikeEvent = Event & {
  clientX?: number;
  clientY?: number;
};

function isElementNode(node: unknown): node is HTMLElement {
  return Boolean(node && typeof node === 'object' && (node as Node).nodeType === Node.ELEMENT_NODE);
}

function isIframeElement(node: unknown): node is HTMLIFrameElement {
  return isElementNode(node) && (node as Element).tagName.toLowerCase() === 'iframe';
}

function getEventTargetElement(event: Event): HTMLElement | null {
  const pathTargets = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const pathTarget = pathTargets.find((node): node is HTMLElement => isElementNode(node));
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
): HTMLElement | null {
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

/**
 * Resolves the deepest accessible same-origin iframe target for a cross-document interaction.
 */
export function resolveIframeEventTarget(
  event: Event,
  iframe?: HTMLIFrameElement
): HTMLElement | null {
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

  if (target instanceof HTMLIFrameElement && isIframeAccessible(target)) {
    const iframeDoc = getIframeDocument(target);
    if (!iframeDoc) {
      return target;
    }

    const iframeRect = target.getBoundingClientRect();
    const iframeTarget = getDeepestAccessibleElementAtPoint(
      iframeDoc,
      event.clientX - iframeRect.left - target.clientLeft,
      event.clientY - iframeRect.top - target.clientTop
    );

    if (iframeTarget) {
      return iframeTarget;
    }
  }

  return target;
}
