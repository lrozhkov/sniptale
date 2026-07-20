// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TraversalContext } from '../../types';
import type { GenericContentExtraction } from '../types';

const {
  extractGenericArticleContentMock,
  extractGenericDocsContentMock,
  extractGenericSearchResultsContentMock,
} = vi.hoisted(() => {
  return {
    extractGenericArticleContentMock: vi.fn(),
    extractGenericDocsContentMock: vi.fn(),
    extractGenericSearchResultsContentMock: vi.fn(),
  };
});

vi.mock('./article-content', () => ({
  extractGenericArticleContent: extractGenericArticleContentMock,
}));

vi.mock('./docs-content', () => ({
  extractGenericDocsContent: extractGenericDocsContentMock,
}));

vi.mock('./search-results', () => ({
  extractGenericSearchResultsContent: extractGenericSearchResultsContentMock,
}));

import { extractGenericContent, extractGenericContentSections } from './extract';

function createContext(url = 'https://example.test/article'): TraversalContext {
  return {
    currentSection: null,
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
      title: 'Canonical title',
      structure: [],
      meta: {
        profile: {
          vendor: 'generic',
          appFamily: 'generic-web',
          pageKind: 'content',
          pipelineId: 'generic-structured',
          confidence: 0.8,
          matchedSignals: [],
          preferredRoots: ['body'],
        },
        title: 'Canonical title',
        url,
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
  };
}

function createExtraction(id: string, title: string): GenericContentExtraction {
  return {
    sections: [
      {
        type: 'section',
        id: `section-${id}`,
        title,
        kind: 'narrative',
        children: [],
      },
    ],
    blocks: [],
  };
}

beforeEach(() => {
  extractGenericArticleContentMock.mockReset();
  extractGenericDocsContentMock.mockReset();
  extractGenericSearchResultsContentMock.mockReset();
});

describe('extractGenericContent orchestration', () => {
  it('returns search extraction when search intent wins', () => {
    const root = document.createElement('main');
    const searchExtraction = createExtraction('search', 'Результаты поиска');
    extractGenericSearchResultsContentMock.mockReturnValue(searchExtraction);
    extractGenericDocsContentMock.mockReturnValue({ sections: [], blocks: [] });
    extractGenericArticleContentMock.mockReturnValue({ sections: [], blocks: [] });

    expect(
      extractGenericContent(root, createContext('https://example.test/search?q=browser'))
    ).toBe(searchExtraction);
  });

  it('merges docs and article extractions when docs content exists', () => {
    const root = document.createElement('main');
    const docsExtraction = createExtraction('docs', 'Reference');
    const articleExtraction = createExtraction('article', 'Overview');
    extractGenericSearchResultsContentMock.mockReturnValue({ sections: [], blocks: [] });
    extractGenericDocsContentMock.mockReturnValue(docsExtraction);
    extractGenericArticleContentMock.mockReturnValue(articleExtraction);

    const extraction = extractGenericContent(root, createContext());

    expect(extraction.sections.map((section) => section.title)).toEqual(['Reference', 'Overview']);
  });

  it('returns article extraction when docs extraction is empty', () => {
    const root = document.createElement('main');
    const articleExtraction = createExtraction('article', 'Overview');
    extractGenericSearchResultsContentMock.mockReturnValue({ sections: [], blocks: [] });
    extractGenericDocsContentMock.mockReturnValue({ sections: [], blocks: [] });
    extractGenericArticleContentMock.mockReturnValue(articleExtraction);

    expect(extractGenericContent(root, createContext())).toBe(articleExtraction);
    expect(extractGenericContentSections(root, createContext())).toEqual(
      articleExtraction.sections
    );
  });

  it('falls back to search extraction when docs and article extractions are empty', () => {
    const root = document.createElement('main');
    const searchExtraction = createExtraction('search', 'Результаты поиска');
    extractGenericSearchResultsContentMock.mockReturnValue(searchExtraction);
    extractGenericDocsContentMock.mockReturnValue({ sections: [], blocks: [] });
    extractGenericArticleContentMock.mockReturnValue({ sections: [], blocks: [] });

    expect(extractGenericContent(root, createContext())).toBe(searchExtraction);
  });
});
