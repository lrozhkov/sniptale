import { getAccessibleIframes, getIframeDocument, isIframeAccessible } from '../core';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseCompositeSelector } from './composite';
import type { CompositeSelector } from './types';

const logger = createLogger({ namespace: 'iframe-utils' });

export function findElementByCompositeSelector(composite: CompositeSelector): HTMLElement | null {
  let doc: Document = document;

  if (composite.iframeSelector) {
    const iframe = document.querySelector(composite.iframeSelector) as HTMLIFrameElement | null;
    if (!iframe) {
      logger.warn(`Iframe not found: ${composite.iframeSelector}`);
      return null;
    }

    if (!isIframeAccessible(iframe)) {
      logger.warn(`Iframe not accessible: ${composite.iframeSelector}`);
      return null;
    }

    doc = iframe.contentDocument!;
  }

  return doc.querySelector(composite.elementSelector) as HTMLElement | null;
}

function findElementBySelectorInDocument(doc: Document, selector: string): HTMLElement | null {
  try {
    return doc.querySelector(selector) as HTMLElement | null;
  } catch {
    return null;
  }
}

function findElementBySelectorInNestedIframes(
  iframes: Iterable<HTMLIFrameElement>,
  selector: string
): HTMLElement | null {
  for (const iframe of iframes) {
    try {
      const iframeDoc = getIframeDocument(iframe);
      if (!iframeDoc) {
        continue;
      }

      const element = findElementBySelectorInDocument(iframeDoc, selector);
      if (element) {
        return element;
      }

      const nestedElement = findElementBySelectorInNestedIframes(
        Array.from(iframeDoc.querySelectorAll('iframe')).filter((nestedIframe) =>
          isIframeAccessible(nestedIframe)
        ),
        selector
      );
      if (nestedElement) {
        return nestedElement;
      }
    } catch {
      // Ignore cross-origin access errors.
    }
  }

  return null;
}

export function findElementBySelector(selector: string): HTMLElement | null {
  const composite = parseCompositeSelector(selector);
  if (composite.iframeSelector) {
    return findElementByCompositeSelector(composite);
  }

  const topLevelElement = findElementBySelectorInDocument(document, selector);
  if (topLevelElement) {
    return topLevelElement;
  }

  return findElementBySelectorInNestedIframes(getAccessibleIframes(), selector);
}
