import { getElementSelector } from '@sniptale/platform/browser/iframe-selectors/element';
import { getAbsolutePosition, getContainingIframe } from '../../../platform/frame';
import { serializeCompositeSelector } from '../../../platform/frame/selectors';
import { getIframeSelector } from '../../../platform/frame/selectors/iframe';
import type { BrowserAnnotationFrameContext, BrowserAnnotationTargetEvidence } from './types';

function createTargetPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && segments.length < 5) {
    const id = current.id ? `#${current.id}` : '';
    const classes = Array.from(current.classList)
      .filter((className) => !className.startsWith('sniptale-'))
      .slice(0, 2)
      .map((className) => `.${className}`)
      .join('');
    segments.unshift(`${current.localName}${id}${classes}`);
    current = current.parentElement;
  }

  return segments.join(' > ');
}

function createFrameContext(element: Element): BrowserAnnotationFrameContext {
  const iframe = getContainingIframe(element);
  if (!iframe) {
    return { kind: 'top-document' };
  }

  const name = iframe.name || iframe.title || undefined;
  const url = element.ownerDocument.location.href || iframe.src || undefined;
  return {
    kind: 'iframe',
    ...(name ? { name } : {}),
    selector: getIframeSelector(iframe),
    ...(url ? { url } : {}),
  };
}

function createFileLabel(element: Element): string {
  const text = element.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 80);
  return `browser:${text || element.localName}`;
}

/** Captures immutable export evidence for one live target before its owner mutation begins. */
export function createBrowserAnnotationTargetEvidence(
  element: Element
): BrowserAnnotationTargetEvidence {
  const elementSelector = getElementSelector(element, { includeSniptaleId: false });
  const iframe = getContainingIframe(element);
  const locator = serializeCompositeSelector({
    elementSelector,
    iframeSelector: iframe ? getIframeSelector(iframe) : null,
  });
  const position = getAbsolutePosition(element);
  const view = element.ownerDocument.defaultView;

  return {
    fileLabel: createFileLabel(element),
    frame: createFrameContext(element),
    locator,
    nodePosition: { x: position.x, y: position.y },
    pageUrl: view?.location.href ?? '',
    targetPath: createTargetPath(element),
    ...(element.getAttribute('role') ? { targetRole: element.getAttribute('role')! } : {}),
    targetSelector: elementSelector,
    targetText: element.textContent?.trim().slice(0, 500) ?? '',
    viewport: {
      height: view?.innerHeight ?? 0,
      width: view?.innerWidth ?? 0,
    },
  };
}
