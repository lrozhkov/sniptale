import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import type { PageProfileDetectorResult } from '../types';
import {
  countReadableAnchors,
  countReadableParagraphs,
  GENERIC_CONTENT_ROOT_SELECTORS,
  queryGenericContentRoot,
} from './generic-detector.helpers';

export function detectGenericArticle(documentRoot: ParentNode): PageProfileDetectorResult | null {
  const mainRoot = queryGenericContentRoot(documentRoot);
  if (!(mainRoot instanceof HTMLElement)) {
    return null;
  }

  const paragraphCount = countReadableParagraphs(mainRoot);
  const headingCount = mainRoot.querySelectorAll('h1, h2, h3').length;
  const tableCount = mainRoot.querySelectorAll('table').length;
  const textLength = mainRoot.textContent?.trim().length ?? 0;
  const readableAnchorCount = countReadableAnchors(mainRoot);

  if (
    textLength < 200 &&
    paragraphCount < 2 &&
    headingCount === 0 &&
    readableAnchorCount < 5 &&
    tableCount === 0
  ) {
    return null;
  }

  const matchedSignals: PageProfile['matchedSignals'] = [
    { id: 'dom.generic-content-root', source: 'dom', strength: 'hard' },
  ];

  return {
    confidence: 0.8,
    matchedSignals,
    profile: {
      vendor: 'generic',
      appFamily: 'generic-web',
      pageKind: 'content',
      pipelineId: 'generic-structured',
      confidence: 0.8,
      matchedSignals,
      preferredRoots: [...GENERIC_CONTENT_ROOT_SELECTORS],
    },
  };
}
