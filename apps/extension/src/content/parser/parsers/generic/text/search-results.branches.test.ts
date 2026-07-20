// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { extractGenericSearchResultsContent } from './search-results';

function createContext(
  pageUrl: string | undefined = undefined,
  pageTitle = 'Search results branches'
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
    snippet?: string;
    title?: string;
  }
): HTMLElement {
  const result = document.createElement('article');
  const heading = document.createElement('h2');
  const link = document.createElement('a');
  link.setAttribute('href', options?.href ?? '');
  link.textContent = options?.title ?? `Result ${index}`;
  heading.append(link);

  const snippet = document.createElement('p');
  snippet.textContent =
    options?.snippet ??
    'Detailed search snippet with enough text to qualify as a result card for extraction.';

  result.append(heading, snippet);
  root.append(result);
  return result;
}

function expectResultsTable(extraction: ReturnType<typeof extractGenericSearchResultsContent>) {
  const section = extraction.sections[0];
  const table = section?.children.find((child) => child.type === 'table');
  expect(table).toBeTruthy();
  return table;
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
});

function registerMissingMetadataFallbackTest() {
  it('falls back to example.test and live anchor href when canonical metadata is unavailable', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { href: '', title: 'Alpha result' });
    appendSearchResult(root, 2, { href: '/beta', title: 'Beta result' });
    appendSearchResult(root, 3, { href: '/gamma', title: 'Gamma result' });

    const extraction = extractGenericSearchResultsContent(root, createContext());
    const table = expectResultsTable(extraction);

    expect(table).toEqual(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              Заголовок: 'Alpha result',
              Ссылка: 'http://localhost:3000/',
              Источник: 'localhost',
            }),
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              Заголовок: 'Beta result',
              Ссылка: 'http://localhost:3000/beta',
              Источник: 'localhost',
            }),
          }),
        ]),
      })
    );
  });
}

function registerLongParagraphRejectionTest() {
  it('rejects short-snippet result pages when long-form paragraphs are present', () => {
    const root = document.createElement('main');
    appendSearchResult(root, 1, { href: '/one', snippet: 'A'.repeat(120) });
    appendSearchResult(root, 2, { href: '/two', snippet: 'B'.repeat(120) });
    appendSearchResult(root, 3, { href: '/three', snippet: 'C'.repeat(120) });
    appendSearchResult(root, 4, { href: '/four', snippet: 'D'.repeat(120) });

    const longParagraph = document.createElement('p');
    longParagraph.textContent = 'L'.repeat(320);
    root.append(longParagraph);

    expect(
      extractGenericSearchResultsContent(root, createContext(undefined, 'Reference page'))
    ).toEqual({
      sections: [],
      blocks: [],
    });
  });
}

describe('search-results branch coverage', () => {
  registerMissingMetadataFallbackTest();
  registerLongParagraphRejectionTest();
});
