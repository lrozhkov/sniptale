import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalPageMetadata } from '../../../platform/page-context/page-metadata';
import { extractCleanText } from '../../dom-utils/dom-helpers';

function resolvePageTitleCandidate(root: ParentNode): HTMLElement | null {
  const selectors = [
    '#firstHeading',
    '.mw-page-title-main',
    'main h1',
    'article h1',
    'h1',
    '.page-title',
    '[data-page-title]',
    '#gwt-debug-title',
  ];

  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match instanceof HTMLElement) {
      const text = extractCleanText(match);
      if (text) {
        return match;
      }
    }
  }

  return null;
}

function resolveGenericPageContext(pageUrl: string): string {
  // These labels intentionally stay source-facing heuristics for supported portals.
  // Product UI must not depend on these strings as semantic identifiers.
  if (pageUrl.includes('employee') || pageUrl.includes('сотрудник')) {
    return 'Карточка сотрудника';
  }
  if (pageUrl.includes('incident') || pageUrl.includes('инцидент')) {
    return 'Карточка инцидента';
  }
  if (pageUrl.includes('service') || pageUrl.includes('услуга')) {
    return 'Карточка услуги';
  }
  if (pageUrl.includes('problem') || pageUrl.includes('проблема')) {
    return 'Карточка проблемы';
  }

  return 'Общая информация';
}

export function determinePageContext(
  root: ParentNode,
  profile: PageProfile | undefined,
  pageMetadata: TraversalPageMetadata
): { context: string; title: string } {
  const pageTitle = resolvePageTitleCandidate(root);
  const title = pageTitle ? extractCleanText(pageTitle) : pageMetadata.pageTitle || 'Страница';

  if (profile?.vendor === 'naumen-sd-gwt') {
    return { context: 'Naumen SD', title };
  }
  if (profile?.vendor === 'naumen-portal') {
    return { context: 'Naumen Portal', title };
  }

  return {
    context: resolveGenericPageContext(pageMetadata.pageUrl),
    title,
  };
}
