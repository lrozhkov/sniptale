import {
  getAbsolutePosition,
  getDocumentViewportBounds,
  getTopViewportPoint,
} from '../../../platform/frame';
import { isFinitePositiveRect, type AnchorRect } from './geometry';

type AnchorVisibilityResult = {
  presentation: 'visible' | 'offscreen' | 'suspended';
  reason: string;
  rect?: AnchorRect;
};

type VisibilityCheckElement = HTMLElement & {
  checkVisibility?: (options?: {
    checkOpacity?: boolean;
    checkVisibilityCSS?: boolean;
    contentVisibilityAuto?: boolean;
    opacityProperty?: boolean;
    visibilityProperty?: boolean;
  }) => boolean;
};

function intersection(left: AnchorRect, right: AnchorRect): AnchorRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  if (rightEdge <= x || bottomEdge <= y) return null;
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

function isMateriallyClipped(rect: AnchorRect, visible: AnchorRect): boolean {
  const tolerance = 0.5;
  return (
    Math.abs(rect.x - visible.x) > tolerance ||
    Math.abs(rect.y - visible.y) > tolerance ||
    Math.abs(rect.width - visible.width) > tolerance ||
    Math.abs(rect.height - visible.height) > tolerance
  );
}

function getPresentationParent(element: HTMLElement): HTMLElement | null {
  if (element.parentElement) return element.parentElement;
  const frameElement = element.ownerDocument.defaultView?.frameElement;
  return frameElement?.nodeType === 1 ? (frameElement as HTMLElement) : null;
}

function containsInPresentationTree(container: Element, candidate: Element) {
  let current: Element | null = candidate;
  while (current) {
    if (current === container) return true;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    const frameElement: Element | null | undefined =
      current.ownerDocument.defaultView?.frameElement;
    current = frameElement?.nodeType === 1 ? frameElement : null;
  }
  return false;
}

function isVisibleCheckboxProxyLabel(element: HTMLElement): boolean {
  if (element.localName !== 'label') return false;
  const controlId = element.getAttribute('for');
  if (!controlId) return false;
  const control = element.ownerDocument.getElementById(controlId);
  return control?.localName === 'input' && control.getAttribute('type') === 'checkbox';
}

export function areElementsPresentationRelated(left: Element, right: Element) {
  return containsInPresentationTree(left, right) || containsInPresentationTree(right, left);
}

function hasHiddenPresentation(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      (current.getAttribute('aria-hidden') === 'true' &&
        !(current === element && isVisibleCheckboxProxyLabel(current)))
    ) {
      return true;
    }
    const view: Window | null = current.ownerDocument.defaultView;
    const style = view?.getComputedStyle(current);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse' ||
      style?.contentVisibility === 'hidden' ||
      Number.parseFloat(style?.opacity ?? '1') === 0
    ) {
      return true;
    }
    current = getPresentationParent(current);
  }

  const checkVisibility = (element as VisibilityCheckElement).checkVisibility;
  if (typeof checkVisibility === 'function') {
    try {
      return !checkVisibility.call(element, {
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true,
        opacityProperty: true,
        visibilityProperty: true,
      });
    } catch {
      return false;
    }
  }
  return false;
}

function localRectToTop(element: HTMLElement, rect: DOMRect): AnchorRect | null {
  const point = getTopViewportPoint(element.ownerDocument, rect.left, rect.top);
  return point ? { x: point.x, y: point.y, width: rect.width, height: rect.height } : null;
}

function classifyClippingAncestors(element: HTMLElement, target: AnchorRect) {
  let current = getPresentationParent(element);
  while (current) {
    const view = current.ownerDocument.defaultView;
    const style = view?.getComputedStyle(current);
    const overflow = [style?.overflow, style?.overflowX, style?.overflowY].filter(Boolean);
    const clipsDynamically = overflow.some((value) => value === 'hidden' || value === 'clip');
    const scrollClips =
      current.tagName.toLowerCase() === 'iframe' ||
      overflow.some((value) => value === 'auto' || value === 'scroll');
    if (clipsDynamically || scrollClips) {
      const clip = getAbsolutePosition(current);
      const visible = intersection(target, clip);
      if (clipsDynamically && (!visible || isMateriallyClipped(target, visible))) {
        return 'suspended' as const;
      }
      if (scrollClips && !visible) return 'offscreen' as const;
      if (scrollClips && visible && isMateriallyClipped(target, visible)) {
        return 'suspended' as const;
      }
    }
    current = getPresentationParent(current);
  }
  return null;
}

export function isAnchorNodeCurrentDocument(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  let currentDocument = element.ownerDocument;
  let depth = 0;
  while (currentDocument !== document && depth < 10) {
    const frame = currentDocument.defaultView?.frameElement as HTMLIFrameElement | null;
    if (!frame || frame.contentDocument !== currentDocument) return false;
    currentDocument = frame.ownerDocument;
    depth += 1;
  }
  return currentDocument === document;
}

export function measureAnchorVisibility(element: HTMLElement): AnchorVisibilityResult {
  if (!isAnchorNodeCurrentDocument(element)) {
    return { presentation: 'suspended', reason: 'stale-document' };
  }
  if (hasHiddenPresentation(element)) {
    return { presentation: 'suspended', reason: 'css-or-aria-hidden' };
  }
  if (element.getClientRects().length === 0) {
    return { presentation: 'suspended', reason: 'missing-layout-box' };
  }

  const localRect = element.getBoundingClientRect();
  const absoluteRect = getAbsolutePosition(element);
  if (!isFinitePositiveRect(absoluteRect)) {
    return { presentation: 'suspended', reason: 'invalid-layout-box' };
  }

  const clipping = classifyClippingAncestors(element, absoluteRect);
  if (clipping) {
    return { presentation: clipping, reason: 'clipping-ancestor', rect: absoluteRect };
  }

  const documentViewport = getDocumentViewportBounds(element.ownerDocument);
  const topViewport = {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  if (
    !intersection(absoluteRect, topViewport) ||
    (documentViewport && !intersection(absoluteRect, documentViewport))
  ) {
    return { presentation: 'offscreen', reason: 'viewport', rect: absoluteRect };
  }

  const translated = localRectToTop(element, localRect);
  return {
    presentation: 'visible',
    reason: 'visible',
    rect: translated ?? absoluteRect,
  };
}
