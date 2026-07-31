import { getAccessibleIframes, getIframeDocument, isIframeAccessible } from '../core';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseCompositeSelector } from './composite';
import type { CompositeSelector } from './types';

const logger = createLogger({ namespace: 'iframe-utils' });

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

export function findElementByCompositeSelector(composite: CompositeSelector): Element | null {
  let doc: Document = document;

  if (composite.iframeSelector) {
    const iframe = document.querySelector(composite.iframeSelector);
    if (!(iframe instanceof HTMLIFrameElement)) {
      logger.warn(`Iframe not found: ${composite.iframeSelector}`);
      return null;
    }

    if (!isIframeAccessible(iframe)) {
      logger.warn(`Iframe not accessible: ${composite.iframeSelector}`);
      return null;
    }

    doc = iframe.contentDocument!;
  }

  return doc.querySelector(composite.elementSelector);
}

function findElementBySelectorInDocument(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

function findElementBySelectorInNestedIframes(
  iframes: Iterable<HTMLIFrameElement>,
  selector: string
): Element | null {
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

export function findElementBySelector(selector: string): Element | null {
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

export function findHtmlElementBySelector(selector: string): HTMLElement | null {
  const element = findElementBySelector(selector);
  return element?.namespaceURI === HTML_NAMESPACE ? (element as HTMLElement) : null;
}
