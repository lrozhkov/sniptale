import type { TraversalContext } from '../../types';
import { resolveGenericFallbackTitle } from './helpers';
import { extractGenericNarrativeContent } from './narrative-blocks.helpers';

const ARTICLE_EXCLUDE_SELECTOR = [
  'nav',
  'aside',
  'header',
  'footer',
  '.MCBreadcrumbsBox',
  '.menu',
  '.sidenav',
  '.toolbar',
  '.tree-node',
  '.topicToolbarProxy',
  '.buttons',
  '.pagination',
].join(', ');

function isArticleContentElement(element: HTMLElement) {
  if (element.matches('[data-sc-normalized-kind="callout"], [data-sc-normalized-kind="code"]')) {
    return true;
  }

  return element.closest(ARTICLE_EXCLUDE_SELECTOR) === null;
}

export function extractGenericArticleContent(root: HTMLElement, ctx: TraversalContext) {
  return extractGenericNarrativeContent({
    ctx,
    root,
    fallbackTitle: resolveGenericFallbackTitle(ctx, 'Статья'),
    isContentElement: isArticleContentElement,
  });
}
