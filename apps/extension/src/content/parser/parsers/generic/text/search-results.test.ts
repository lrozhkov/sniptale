// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { extractGenericSearchResultsContent } from './search-results';

function createContext(
  pageUrl = 'https://example.test/search',
  pageTitle = 'Search results'
): TraversalContext {
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
      title: pageTitle,
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
        title: pageTitle,
        url: pageUrl,
        warnings: [],
      },
      structure: [],
    } as ParsedDOMTree,
    sectionElements: [],
    sectionIndex: 1,
  };
}

function appendSearchResult(
  root: HTMLElement,
  index: number,
  options?: {
    href?: string;
    removeHrefAttribute?: boolean;
    snippet?: string;
    title?: string;
  }
): HTMLElement {
  const result = document.createElement('article');
  const heading = document.createElement('h2');
  const link = document.createElement('a');
  link.href = options?.href ?? `/result-${index}`;
  link.textContent = options?.title ?? `Result ${index}`;
  if (options?.removeHrefAttribute) {
    link.removeAttribute('href');
  }
  heading.append(link);

  const snippet = document.createElement('p');
  snippet.textContent =
    options?.snippet ??
    'Detailed search snippet with enough text to qualify as a result card for extraction.';

  result.append(heading, snippet);
  root.append(result);
  return result;
}

function appendSearchResults(
  root: HTMLElement,
  count: number,
  options?: { pageHrefPrefix?: string }
) {
  for (let index = 1; index <= count; index += 1) {
    appendSearchResult(root, index, {
      href: options?.pageHrefPrefix ? `${options.pageHrefPrefix}${index}` : `/result-${index}`,
    });
  }
}

function expectResultsTable(extraction: ReturnType<typeof extractGenericSearchResultsContent>) {
  const section = extraction.sections[0];
  const table = section?.children.find((child) => child.type === 'table');

  expect(section).toMatchObject({
    title: 'Результаты поиска',
    kind: 'results',
  });
  expect(table).toBeTruthy();
  return table;
}

function registerCanonicalMetadataTest() {
  it('derives search-result source hostnames from canonical context metadata, not live location', () => {
    window.history.replaceState({}, '', '/live-page');

    const root = document.createElement('main');
    appendSearchResults(root, 3);

    const extraction = extractGenericSearchResultsContent(
      root,
      createContext('https://canonical.example/search?q=browser')
    );

    const table = expectResultsTable(extraction);
    expect(table).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              Источник: 'canonical.example',
              Ссылка: 'https://canonical.example/result-1',
            }),
          }),
        ]),
      })
    );
  });
}

function registerHrefFallbackTests() {
  it('falls back to the live anchor href when URL reconstruction throws', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { href: 'http://%' });
    appendSearchResults(root, 2);

    const extraction = extractGenericSearchResultsContent(root, createContext('not a valid url'));
    const table = expectResultsTable(extraction);

    expect(table).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              Ссылка: 'http://%',
              Источник: '',
            }),
          }),
        ]),
      })
    );
  });

  it('rejects surfaces when fewer than three valid result candidates remain', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { removeHrefAttribute: true });
    appendSearchResults(root, 2, { pageHrefPrefix: 'https://fallback.example.test/result-' });

    expect(
      extractGenericSearchResultsContent(
        root,
        createContext('https://fallback.example.test/library')
      )
    ).toEqual({
      sections: [],
      blocks: [],
    });
  });
}

function registerSearchSurfaceTests() {
  it('deduplicates repeated search-result cards by title and href', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { href: 'https://example.test/dup', title: 'Repeated result' });
    appendSearchResult(root, 2, { href: 'https://example.test/dup', title: 'Repeated result' });
    appendSearchResult(root, 3, { href: 'https://example.test/unique', title: 'Unique result' });
    appendSearchResult(root, 4, { href: 'https://example.test/another', title: 'Another result' });

    const extraction = extractGenericSearchResultsContent(
      root,
      createContext('https://example.test/search?q=dup')
    );
    const table = expectResultsTable(extraction);

    expect(table).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ Заголовок: 'Repeated result' }),
          }),
        ]),
      })
    );
    expect(table?.rows).toHaveLength(3);
  });
}

function registerDistinctHrefRetentionTest() {
  it('keeps results with the same title when their hrefs differ', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { href: 'https://example.test/one', title: 'Repeated title' });
    appendSearchResult(root, 2, { href: 'https://example.test/two', title: 'Repeated title' });
    appendSearchResult(root, 3, { href: 'https://example.test/three', title: 'Third title' });
    appendSearchResult(root, 4, { href: 'https://example.test/four', title: 'Fourth title' });

    const extraction = extractGenericSearchResultsContent(root, createContext());
    const table = expectResultsTable(extraction);

    expect(table?.rows).toHaveLength(4);
    expect(
      table?.rows
        .filter((row) => row.data['Заголовок'] === 'Repeated title')
        .map((row) => row.data['Ссылка'])
    ).toEqual(['https://example.test/one', 'https://example.test/two']);
  });
}

function registerExplicitSignalSearchSurfaceTest() {
  it('accepts three-result pages when the context carries an explicit search signal', () => {
    const root = document.createElement('main');
    appendSearchResults(root, 3, { pageHrefPrefix: 'https://search.example.test/r-' });

    const extraction = extractGenericSearchResultsContent(
      root,
      createContext('https://search.example.test/?q=network')
    );

    expect(expectResultsTable(extraction)?.rows).toHaveLength(3);
  });
}

function registerNoSignalRejectionTests() {
  it('rejects three-result pages without an explicit search signal', () => {
    const root = document.createElement('main');
    appendSearchResults(root, 3, { pageHrefPrefix: 'https://plain.example.test/r-' });

    expect(
      extractGenericSearchResultsContent(
        root,
        createContext('https://plain.example.test/library', 'Reference page')
      )
    ).toEqual({
      sections: [],
      blocks: [],
    });
  });

  it('rejects long-form result surfaces without an explicit search signal', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { snippet: 'X'.repeat(300) });
    appendSearchResult(root, 2, { snippet: 'Y'.repeat(300) });
    appendSearchResult(root, 3, { snippet: 'Z'.repeat(300) });
    appendSearchResult(root, 4, { snippet: 'W'.repeat(300) });

    expect(
      extractGenericSearchResultsContent(
        root,
        createContext('https://example.test/article', 'Article page')
      )
    ).toEqual({
      sections: [],
      blocks: [],
    });
  });
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
});

describe('search-results parser', () => {
  registerCanonicalMetadataTest();
  registerHrefFallbackTests();
  registerSearchSurfaceTests();
  registerDistinctHrefRetentionTest();
  registerExplicitSignalSearchSurfaceTest();
  registerNoSignalRejectionTests();
});
