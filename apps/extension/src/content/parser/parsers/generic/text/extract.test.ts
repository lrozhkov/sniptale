// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { extractGenericContent, extractGenericContentSections } from './extract';

function resetGenericContentDom(): void {
  document.body.replaceChildren();
  document.title = '';
}

function createContext(): TraversalContext {
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
      title: 'test',
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
        title: 'test',
        url: 'https://example.test/article',
        warnings: [],
      },
      structure: [],
    } as ParsedDOMTree,
    sectionElements: [],
    sectionIndex: 1,
  };
}

afterEach(() => {
  resetGenericContentDom();
});

it('extracts paragraph prose without truncating inline links', () => {
  const article = document.createElement('article');
  const heading = document.createElement('h1');
  heading.textContent = 'World Wide Web';
  const paragraph = document.createElement('p');
  const link = document.createElement('a');
  link.href = 'https://example.com/tim';
  link.textContent = 'Tim Berners-Lee';

  paragraph.append(
    document.createTextNode('The Web was invented by '),
    link,
    document.createTextNode(' at CERN.')
  );
  article.append(heading, paragraph);

  const sections = extractGenericContentSections(article, createContext());
  const paragraphField = sections[0]?.children.find((child) => child.type === 'field');

  expect(paragraphField).toEqual(
    expect.objectContaining({
      contentRole: 'paragraph',
      value: 'The Web was invented by Tim Berners-Lee at CERN.',
    })
  );
});

it('marks docs list items as narrative bullets instead of property fields', () => {
  const docsRoot = document.createElement('div');
  docsRoot.className = 'markdown-body';

  const heading = document.createElement('h2');
  heading.textContent = 'See also';
  const list = document.createElement('ul');
  const firstItem = document.createElement('li');
  firstItem.textContent = 'HTTP reference';
  const secondItem = document.createElement('li');
  secondItem.textContent = 'URL standard';
  list.append(firstItem, secondItem);
  docsRoot.append(heading, list);

  const sections = extractGenericContentSections(docsRoot, createContext());
  const listItems = sections[0]?.children.filter((child) => child.type === 'field') ?? [];

  expect(listItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ contentRole: 'list-item', value: 'HTTP reference' }),
      expect.objectContaining({ contentRole: 'list-item', value: 'URL standard' }),
    ])
  );
});

it('builds canonical narrative blocks for paragraphs, lists, quotes, callouts, and code', () => {
  const docsRoot = createNarrativeBlocksRoot();

  const extraction = extractGenericContent(docsRoot, createContext());

  expect(extraction.blocks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'heading', text: 'Reference' }),
      expect.objectContaining({
        kind: 'paragraph',
        text: 'Defuddle-inspired structure should enrich the canonical parsed document.',
      }),
      expect.objectContaining({
        kind: 'list',
        items: ['Preserve provenance', 'Keep projector parity'],
      }),
      expect.objectContaining({
        kind: 'quote',
        text: 'A stable IR is more valuable than formatter-local heuristics.',
      }),
      expect.objectContaining({
        kind: 'callout',
        text: 'Callout blocks should stay distinct from plain paragraphs.',
      }),
      expect.objectContaining({ kind: 'code', text: 'const block = true;' }),
    ])
  );
});

it('prefers heading-scoped article sections over false search results on long-form pages', () => {
  const root = createLongFormArticleRoot();
  const ctx = createContext();
  ctx.result.title = 'World Wide Web - Wikipedia';
  if (ctx.result.meta) {
    ctx.result.meta.title = 'World Wide Web - Wikipedia';
    ctx.result.meta.url = 'https://example.test/wiki/World_Wide_Web';
  }

  const sections = extractGenericContentSections(root, ctx);
  const titles = sections.map((section) => section.title);
  const historySection = sections.find((section) => section.title === 'History');
  const historyParagraphField = historySection?.children.find((child) => child.type === 'field');

  expect(titles).toEqual(expect.arrayContaining(['History', 'Standards']));
  expect(titles).not.toContain('Результаты поиска');
  expect(historyParagraphField).toEqual(
    expect.objectContaining({
      contentRole: 'paragraph',
      value: expect.stringContaining('This closing sentence must remain intact after extraction.'),
    })
  );
  expect(historyParagraphField?.value.endsWith('...')).toBe(false);
});

function createTextElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  text: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function createNarrativeBlocksRoot(): HTMLElement {
  const docsRoot = document.createElement('article');
  const callout = createTextElement(
    'aside',
    'Callout blocks should stay distinct from plain paragraphs.'
  );
  callout.setAttribute('data-sc-normalized-kind', 'callout');

  docsRoot.append(
    createTextElement('h2', 'Reference'),
    createTextElement(
      'p',
      'Defuddle-inspired structure should enrich the canonical parsed document.'
    ),
    createNarrativeList(['Preserve provenance', 'Keep projector parity']),
    createTextElement(
      'blockquote',
      'A stable IR is more valuable than formatter-local heuristics.'
    ),
    callout,
    createTextElement('pre', 'const block = true;')
  );
  return docsRoot;
}

function createNarrativeList(items: string[]): HTMLUListElement {
  const list = document.createElement('ul');
  for (const itemText of items) {
    list.append(createTextElement('li', itemText));
  }
  return list;
}

function createLongFormArticleRoot(): HTMLElement {
  const root = document.createElement('main');
  root.id = 'content';
  root.append(
    createTextElement('h2', 'History'),
    createTextElement(
      'p',
      `${'A'.repeat(260)} ${'B'.repeat(260)} This closing sentence must remain intact after extraction.`
    ),
    createTextElement('h2', 'Standards'),
    createTextElement(
      'p',
      'The World Wide Web Consortium maintains standards for interoperable web technologies.'
    ),
    createRelatedSpecsList()
  );
  return root;
}

function createRelatedSpecsList(): HTMLUListElement {
  const relatedList = document.createElement('ul');
  for (let index = 1; index <= 4; index += 1) {
    const link = document.createElement('a');
    link.href = `https://example.com/spec-${index}`;
    link.textContent = `Specification ${index}`;
    const item = document.createElement('li');
    item.append(link, document.createTextNode(' supporting material for long-form documentation.'));
    relatedList.append(item);
  }
  return relatedList;
}

it('prefers explicit search-result surfaces when canonical page metadata signals search intent', () => {
  const root = document.createElement('main');

  for (let index = 1; index <= 5; index += 1) {
    const result = document.createElement('article');
    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = `https://example.test/result-${index}`;
    link.textContent = `Result ${index}`;
    heading.append(link);
    const snippet = document.createElement('p');
    snippet.textContent =
      'Detailed search snippet with enough text to qualify as a result card for canonical extraction.';
    result.append(heading, snippet);
    root.append(result);
  }

  const ctx = createContext();
  ctx.result.title = 'Search results';
  if (ctx.result.meta) {
    ctx.result.meta.title = 'Search results';
    ctx.result.meta.url = 'https://example.test/search?q=browser';
  }

  const extraction = extractGenericContent(root, ctx);

  expect(extraction.sections[0]?.title).toBe('Результаты поиска');
  expect(extraction.sections[0]?.kind).toBe('results');
});
