import type { TraversalContext } from '../../types';
import { resolveGenericFallbackTitle } from './helpers';
import { extractGenericNarrativeContent } from './narrative-blocks.helpers';

const DOCS_EXCLUDE_SELECTOR = [
  'nav',
  'aside',
  'header',
  'footer',
  '.MCBreadcrumbsBox',
  '.menu',
  '.sidenav',
  '.toolbar',
  '.buttons',
  '.pagination',
].join(', ');

function isDocsContentElement(element: HTMLElement) {
  if (element.matches('[data-sc-normalized-kind="callout"], [data-sc-normalized-kind="code"]')) {
    return true;
  }

  return element.closest(DOCS_EXCLUDE_SELECTOR) === null;
}

export function extractGenericDocsContent(root: HTMLElement, ctx: TraversalContext) {
  return extractGenericNarrativeContent({
    ctx,
    root,
    fallbackTitle: resolveGenericFallbackTitle(ctx, 'Документация'),
    isContentElement: isDocsContentElement,
  });
}
