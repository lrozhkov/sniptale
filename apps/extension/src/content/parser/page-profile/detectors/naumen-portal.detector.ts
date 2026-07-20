import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { PageProfileDetectorContext, PageProfileDetectorResult } from '../types';

function resolvePagePathname(context: PageProfileDetectorContext): string {
  if (context.pageUrl) {
    try {
      return new URL(context.pageUrl).pathname;
    } catch {
      // Fall back to the live page below.
    }
  }

  return typeof window === 'undefined' ? '' : window.location.pathname;
}

function buildSignals(
  documentRoot: ParentNode,
  context: PageProfileDetectorContext
): PageProfile['matchedSignals'] {
  const signals: PageProfile['matchedSignals'] = [];
  const pathname = resolvePagePathname(context);

  if (pathname.startsWith('/portal/')) {
    signals.push({ id: 'url.portal-root', source: 'url', strength: 'hard' });
  }

  if (
    documentRoot.querySelector('.ServiceCall__serviceCall, .Details__details, .SearchBlock__root')
  ) {
    signals.push({ id: 'dom.portal-layout', source: 'dom', strength: 'hard' });
  }

  if (documentRoot.querySelector('#serviceCall')) {
    signals.push({ id: 'dom.portal-service-call-root', source: 'dom', strength: 'hard' });
  }

  if (
    documentRoot.querySelector(
      '.Details__hierarchicalTable, .Block__block, .DetailsHead__serviceTitle, .DetailsHead__routeTitle'
    )
  ) {
    signals.push({ id: 'dom.portal-details', source: 'dom', strength: 'hard' });
  }

  if (documentRoot.querySelector('.Comment__comment, .Footer__footerBlock, .Section__root')) {
    signals.push({ id: 'dom.portal-components', source: 'dom', strength: 'soft' });
  }

  return signals;
}

function resolvePageKind(documentRoot: ParentNode, context: PageProfileDetectorContext): string {
  if (documentRoot.querySelector('#serviceCall')) {
    return 'service-call';
  }

  if (documentRoot.querySelector('.Details__hierarchicalTable')) {
    return 'details-page';
  }

  if (resolvePagePathname(context) === '/portal/' && documentRoot.querySelector('.Main__root')) {
    return 'homepage';
  }

  if (documentRoot.querySelector('.SearchBlock__root')) {
    return 'portal-page';
  }

  return 'workspace';
}

function resolvePreferredRoots(pageKind: string): string[] {
  if (pageKind === 'service-call') {
    return ['#serviceCall', '.ContentLayout__root', 'body'];
  }

  if (pageKind === 'homepage') {
    return ['.Main__root', '.CoreLayout__content', 'body'];
  }

  return ['main', '[role="main"]', 'body'];
}

export function detectNaumenPortal(
  documentRoot: ParentNode,
  context: PageProfileDetectorContext
): PageProfileDetectorResult | null {
  const matchedSignals = buildSignals(documentRoot, context);
  if (!matchedSignals.some((signal) => signal.strength === 'hard')) {
    return null;
  }

  const pageKind = resolvePageKind(documentRoot, context);
  const confidence = matchedSignals.length >= 3 ? 0.99 : 0.94;

  return {
    confidence,
    matchedSignals,
    profile: {
      vendor: 'naumen-portal',
      appFamily: 'naumen-portal',
      pageKind,
      pipelineId: 'naumen-portal',
      confidence,
      matchedSignals,
      preferredRoots: resolvePreferredRoots(pageKind),
    },
  };
}
