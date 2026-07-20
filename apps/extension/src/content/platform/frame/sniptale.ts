import { getAccessibleIframes, getIframeDocument, isIframeAccessible } from './core';
import { escapeCssIdentifier } from '@sniptale/platform/browser/iframe-selectors/css';

type SniptaleLookup = { element: HTMLElement; iframe?: HTMLIFrameElement } | null;

function findElementBySniptaleIdInDocument(doc: Document, id: string): HTMLElement | null {
  return doc.querySelector(`[data-sniptale-id="${escapeCssIdentifier(id)}"]`) as HTMLElement | null;
}

function clearSniptaleIdsInDocument(doc: Document): void {
  doc.querySelectorAll('[data-sniptale-id]').forEach((element) => {
    delete (element as HTMLElement).dataset['sniptaleId'];
  });
}

function findElementInNestedIframes(
  iframes: Iterable<HTMLIFrameElement>,
  id: string
): SniptaleLookup {
  for (const iframe of iframes) {
    try {
      const iframeDoc = getIframeDocument(iframe);
      if (!iframeDoc) {
        continue;
      }

      const iframeElement = findElementBySniptaleIdInDocument(iframeDoc, id);
      if (iframeElement) {
        return { element: iframeElement, iframe };
      }

      const nestedLookup = findElementInNestedIframes(
        Array.from(iframeDoc.querySelectorAll('iframe')).filter((nestedIframe) =>
          isIframeAccessible(nestedIframe)
        ),
        id
      );
      if (nestedLookup) {
        return nestedLookup;
      }
    } catch {
      // Ignore cross-origin errors.
    }
  }

  return null;
}

function clearSniptaleIdsInNestedIframes(iframes: Iterable<HTMLIFrameElement>): void {
  for (const iframe of iframes) {
    try {
      const iframeDoc = getIframeDocument(iframe);
      if (!iframeDoc) {
        continue;
      }

      clearSniptaleIdsInDocument(iframeDoc);
      clearSniptaleIdsInNestedIframes(
        Array.from(iframeDoc.querySelectorAll('iframe')).filter((nestedIframe) =>
          isIframeAccessible(nestedIframe)
        )
      );
    } catch {
      // Ignore cross-origin errors.
    }
  }
}

/**
 * Find element by sniptale-id across all documents (top-level + iframes).
 */
export function findElementBySniptaleId(id: string): SniptaleLookup {
  const topLevelElement = findElementBySniptaleIdInDocument(document, id);
  if (topLevelElement) {
    return { element: topLevelElement };
  }

  return findElementInNestedIframes(getAccessibleIframes(), id);
}

/**
 * Clear all data-sniptale-id attributes from all documents (top-level + iframes).
 */
export function clearAllSniptaleIds(): void {
  clearSniptaleIdsInDocument(document);
  clearSniptaleIdsInNestedIframes(getAccessibleIframes());
}
