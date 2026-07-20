import type { TraversalContext } from '../../types';
import { extractGenericArticleContent } from './article-content';
import { extractGenericDocsContent } from './docs-content';
import { mergeGenericExtractions, shouldPreferSearchExtraction } from './helpers';
import { extractGenericSearchResultsContent } from './search-results';
import type { GenericContentExtraction } from '../types';

export function extractGenericContent(
  root: HTMLElement,
  ctx: TraversalContext
): GenericContentExtraction {
  const searchContent = extractGenericSearchResultsContent(root, ctx);
  const docsContent = extractGenericDocsContent(root, ctx);
  const articleContent = extractGenericArticleContent(root, ctx);
  if (shouldPreferSearchExtraction(searchContent, docsContent, articleContent, ctx, root)) {
    return searchContent;
  }

  if (docsContent.sections.length > 0) {
    return mergeGenericExtractions(docsContent, articleContent);
  }

  if (articleContent.sections.length > 0) {
    return articleContent;
  }

  return searchContent;
}

export function extractGenericContentSections(root: HTMLElement, ctx: TraversalContext) {
  return extractGenericContent(root, ctx).sections;
}
