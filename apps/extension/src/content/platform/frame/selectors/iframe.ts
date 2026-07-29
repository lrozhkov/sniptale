import {
  escapeCssIdentifier,
  escapeCssString,
} from '@sniptale/platform/browser/iframe-selectors/css';

function getNthOfTypeSegment(element: Element): string {
  const parent = element.parentElement;
  const tagName = escapeCssIdentifier(element.localName);
  if (!parent) return tagName;
  const sameTypeSiblings = Array.from(parent.children).filter(
    (sibling) => sibling.localName === element.localName
  );
  return `${tagName}:nth-of-type(${sameTypeSiblings.indexOf(element) + 1})`;
}

function isUniqueSelector(rootDocument: Document, selector: string, element: Element): boolean {
  try {
    const matches = rootDocument.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

function getScopedStructuralSelector(iframe: HTMLIFrameElement, rootDocument: Document): string {
  const segments = [getNthOfTypeSegment(iframe)];
  let current = iframe.parentElement;

  while (current) {
    const selector = segments.join(' > ');
    if (isUniqueSelector(rootDocument, selector, iframe)) return selector;
    segments.unshift(
      current.id
        ? `${escapeCssIdentifier(current.localName)}#${escapeCssIdentifier(current.id)}`
        : getNthOfTypeSegment(current)
    );
    current = current.parentElement;
  }

  return segments.join(' > ');
}

export function getIframeSelector(
  iframe: HTMLIFrameElement,
  rootDocument: Document = iframe.ownerDocument
): string {
  if (iframe.id) {
    const selector = `iframe#${escapeCssIdentifier(iframe.id)}`;
    if (isUniqueSelector(rootDocument, selector, iframe)) return selector;
  }

  const src = iframe.src || '';
  if (src && !src.startsWith('about:')) {
    const srcMatch = src.match(/[^/]+$/);
    if (srcMatch) {
      const selector = `iframe[src*="${escapeCssString(srcMatch[0])}"]`;
      if (isUniqueSelector(rootDocument, selector, iframe)) return selector;
    }
  }

  const appCode = iframe.getAttribute('data-application-code');
  if (appCode) {
    const selector = `iframe[data-application-code="${escapeCssString(appCode)}"]`;
    if (isUniqueSelector(rootDocument, selector, iframe)) return selector;
  }

  return getScopedStructuralSelector(iframe, rootDocument);
}
