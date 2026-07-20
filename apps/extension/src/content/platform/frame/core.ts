/**
 * Utilities for working with same-origin iframes.
 */

/**
 * Check if an iframe is accessible (same-origin).
 */
export function getIframeDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    return iframe.contentDocument || iframe.contentWindow?.document || null;
  } catch {
    return null;
  }
}

/**
 * Check if an iframe is accessible (same-origin).
 */
export function isIframeAccessible(iframe: HTMLIFrameElement): boolean {
  const src = iframe.src || '';
  if (src.startsWith('about:')) {
    return true;
  }

  return getIframeDocument(iframe) !== null;
}

/**
 * Get all accessible (same-origin) iframes on the page.
 */
export function getAccessibleIframes(rootDoc: Document = document): HTMLIFrameElement[] {
  return Array.from(rootDoc.querySelectorAll('iframe')).filter((iframe) =>
    isIframeAccessible(iframe)
  );
}

/**
 * Translate iframe-local viewport coordinates into top-document viewport coordinates.
 */
export function getViewportClientPoint(
  x: number,
  y: number,
  iframe?: HTMLIFrameElement
): { x: number; y: number } {
  if (!iframe) {
    return { x, y };
  }

  const iframeRect = iframe.getBoundingClientRect();
  return {
    x: x + iframeRect.left + iframe.clientLeft,
    y: y + iframeRect.top + iframe.clientTop,
  };
}

/**
 * Get absolute position of an element, accounting for iframe offsets.
 */
export function getAbsolutePosition(element: HTMLElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rect = element.getBoundingClientRect();
  let x = rect.left;
  let y = rect.top;

  let currentDoc = element.ownerDocument;
  let attempts = 0;

  while (currentDoc !== document && attempts < 10) {
    attempts += 1;

    const iframe = currentDoc.defaultView?.frameElement as HTMLIFrameElement | null;
    if (!iframe) {
      break;
    }

    const iframeRect = iframe.getBoundingClientRect();
    x += iframeRect.left;
    y += iframeRect.top;
    currentDoc = iframe.ownerDocument;
  }

  return { x, y, width: rect.width, height: rect.height };
}

/**
 * Get the iframe that contains an element, if any.
 */
export function getContainingIframe(element: HTMLElement): HTMLIFrameElement | null {
  const doc = element.ownerDocument;
  if (doc === document) {
    return null;
  }

  return doc.defaultView?.frameElement as HTMLIFrameElement | null;
}

/**
 * Walk through all documents (top-level + iframes) and execute callback.
 */
export function walkAllDocuments(
  callback: (doc: Document, iframe?: HTMLIFrameElement) => void,
  rootDoc: Document = document
): void {
  const visitedDocs = new WeakSet<Document>();

  const visitDocument = (doc: Document, iframe?: HTMLIFrameElement): void => {
    if (visitedDocs.has(doc)) {
      return;
    }

    visitedDocs.add(doc);
    callback(doc, iframe);

    getAccessibleIframes(doc).forEach((nestedIframe) => {
      const nestedDoc = getIframeDocument(nestedIframe);
      if (nestedDoc) {
        visitDocument(nestedDoc, nestedIframe);
      }
    });
  };

  visitDocument(rootDoc);
}

/**
 * Get element at point, searching through all documents (including iframes).
 */
export function getElementAtPoint(
  x: number,
  y: number
): { element: HTMLElement; iframe?: HTMLIFrameElement } | null {
  return getElementAtPointInDocument(x, y, document);
}

function getElementAtPointInDocument(
  x: number,
  y: number,
  rootDoc: Document,
  iframe?: HTMLIFrameElement
): { element: HTMLElement; iframe?: HTMLIFrameElement } | null {
  for (const nestedIframe of getAccessibleIframes(rootDoc)) {
    const iframeRect = nestedIframe.getBoundingClientRect();
    if (
      x < iframeRect.left ||
      x > iframeRect.right ||
      y < iframeRect.top ||
      y > iframeRect.bottom
    ) {
      continue;
    }

    const nestedDoc = getIframeDocument(nestedIframe);
    if (!nestedDoc) {
      continue;
    }

    const nestedHit = getElementAtPointInDocument(
      x - iframeRect.left - nestedIframe.clientLeft,
      y - iframeRect.top - nestedIframe.clientTop,
      nestedDoc,
      nestedIframe
    );
    if (nestedHit) {
      return nestedHit;
    }
  }

  const element = rootDoc.elementFromPoint(x, y) as HTMLElement | null;
  if (!element) {
    return null;
  }

  return iframe ? { element, iframe } : { element };
}
