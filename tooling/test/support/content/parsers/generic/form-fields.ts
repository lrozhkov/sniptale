import type { TraversalContext } from '../../../../../../apps/extension/src/content/parser/parsers/types';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';

export function createParserSection(title = 'Current section'): SectionNode {
  return {
    type: 'section',
    id: `section-${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    children: [],
    selected: true,
  };
}

export function createParserContext(
  pageUrl = 'https://example.test/form/',
  currentSection: SectionNode | null = null
): TraversalContext {
  return {
    currentSection,
    globalFieldIndex: 1,
    globalTableIndex: 1,
    pendingFields: new Map<string, never[]>(),
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: 'test',
      title: 'Form page',
      structure: currentSection ? [currentSection] : [],
      meta: {
        profile: {
          vendor: 'generic',
          appFamily: 'generic-web',
          pageKind: 'form',
          pipelineId: 'generic-structured',
          confidence: 0.8,
          matchedSignals: [],
          preferredRoots: ['body'],
        },
        title: 'Form page',
        url: pageUrl,
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}
