import { getElementSelector } from '@sniptale/platform/browser/iframe-selectors/element';
import {
  browserAnnotationSession,
  type BrowserAnnotationFrameContext,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { getAbsolutePosition, getContainingIframe } from '../../../platform/frame';
import { getIframeSelector } from '../../../platform/frame/selectors/iframe';
import { serializeCompositeSelector } from '../../../platform/frame/selectors';
import type { CssDeclarationDelta, PageStyleMutationElement } from './types';
import { isCssDeclarationValueAllowed } from './validation';

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

/** Captures selector and page context once, before the mutation starts. */
export function createPageStyleAnnotationEvidence(
  element: PageStyleMutationElement
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

/** Publishes only deltas accepted by the same declaration policy used by apply and replay. */
export function publishPageStyleAnnotation(args: {
  changes: CssDeclarationDelta[];
  evidence: BrowserAnnotationTargetEvidence;
  target: PageStyleMutationElement;
}): void {
  if (args.changes.length === 0) {
    return;
  }

  const allChangesValid = args.changes.every((change) =>
    (['before', 'after'] as const).every((side) => {
      const policy = side === 'before' ? change.beforePolicy : change.afterPolicy;
      return isCssDeclarationValueAllowed({
        ...(policy.assetUrl ? { assetUrl: policy.assetUrl } : {}),
        element: args.target,
        property: change.property,
        source: policy.source,
        value: change[side],
      });
    })
  );
  if (!allChangesValid) {
    throw new Error('Cannot publish invalid page-style annotation evidence');
  }

  browserAnnotationSession.recordPropertyChanges({
    changes: args.changes.map((change) => ({
      after: { ...change.after },
      before: { ...change.before },
      order: change.order,
      property: change.property,
    })),
    evidence: args.evidence,
    target: args.target,
  });
}
