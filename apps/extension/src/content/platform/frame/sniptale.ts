import { getAccessibleIframes, getIframeDocument, isIframeAccessible } from './core';
import { escapeCssIdentifier } from '@sniptale/platform/browser/iframe-selectors/css';

type SniptaleLookup = { element: HTMLElement; iframe?: HTMLIFrameElement } | null;
const retainedSniptaleIds = new Set<string>();

function findElementBySniptaleIdInDocument(doc: Document, id: string): HTMLElement | null {
  return doc.querySelector(`[data-sniptale-id="${escapeCssIdentifier(id)}"]`) as HTMLElement | null;
}

function clearSniptaleIdsInDocument(doc: Document, shouldClear: (id: string) => boolean): void {
  doc.querySelectorAll('[data-sniptale-id]').forEach((element) => {
    const htmlElement = element as HTMLElement;
    const id = htmlElement.dataset['sniptaleId'];
    if (id && shouldClear(id)) {
      delete htmlElement.dataset['sniptaleId'];
    }
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

function clearSniptaleIdsInNestedIframes(
  iframes: Iterable<HTMLIFrameElement>,
  shouldClear: (id: string) => boolean
): void {
  for (const iframe of iframes) {
    try {
      const iframeDoc = getIframeDocument(iframe);
      if (!iframeDoc) {
        continue;
      }

      clearSniptaleIdsInDocument(iframeDoc, shouldClear);
      clearSniptaleIdsInNestedIframes(
        Array.from(iframeDoc.querySelectorAll('iframe')).filter((nestedIframe) =>
          isIframeAccessible(nestedIframe)
        ),
        shouldClear
      );
    } catch {
      // Ignore cross-origin errors.
    }
  }
}

function clearMatchingSniptaleIds(shouldClear: (id: string) => boolean): void {
  clearSniptaleIdsInDocument(document, shouldClear);
  clearSniptaleIdsInNestedIframes(getAccessibleIframes(), shouldClear);
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
 * Clear unretained data-sniptale-id attributes from all documents (top-level + iframes).
 */
export function clearAllSniptaleIds(): void {
  clearMatchingSniptaleIds((id) => !retainedSniptaleIds.has(id));
}

/**
 * Keeps a transient parser id available while another content owner uses it as an in-memory
 * locator. The id remains removable when that owner releases its bounded session.
 */
export function retainSniptaleId(id: string): void {
  if (id) {
    retainedSniptaleIds.add(id);
  }
}

/**
 * Releases and removes only the ids retained by a completed owner session.
 */
export function clearRetainedSniptaleIds(ids: Iterable<string>): void {
  const idsToClear = new Set(ids);
  idsToClear.forEach((id) => retainedSniptaleIds.delete(id));
  clearMatchingSniptaleIds((id) => idsToClear.has(id));
}
