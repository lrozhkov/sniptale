// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { TextContentParser } from './content';

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
      title: 'Text content',
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
        title: 'Text content',
        url: 'https://example.test/article',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerExcludePatternTest() {
  it('rejects excluded div containers even when they contain paragraphs', () => {
    const parser = new TextContentParser();
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.append(document.createElement('p'), document.createElement('p'));

    expect(parser.canParse(sidebar, createContext())).toBe(false);
  });
}

function registerNestedParagraphsTest() {
  it('accepts div containers with nested paragraphs under direct div wrappers', () => {
    const parser = new TextContentParser();
    const container = document.createElement('div');

    for (let index = 0; index < 3; index += 1) {
      const wrapper = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = `Narrative paragraph ${index + 1} `.repeat(8);
      wrapper.append(paragraph);
      container.append(wrapper);
    }

    expect(parser.canParse(container, createContext())).toBe(true);
  });
}

function registerSectionAndDivShapeTests() {
  it('requires two paragraphs for section surfaces and rejects sparse div content', () => {
    const parser = new TextContentParser();
    const section = document.createElement('section');
    section.append(document.createElement('p'), document.createElement('p'));

    const sparseDiv = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.append(document.createElement('p'));
    sparseDiv.append(wrapper);

    expect(parser.canParse(section, createContext())).toBe(true);
    expect(parser.canParse(sparseDiv, createContext())).toBe(false);
  });

  it('accepts article, main, and div surfaces when they expose direct content signals', () => {
    const parser = new TextContentParser();
    const article = document.createElement('article');
    article.append(document.createElement('h2'));
    const main = document.createElement('main');
    main.append(document.createElement('p'));
    const directDiv = document.createElement('div');
    directDiv.append(document.createElement('p'), document.createElement('p'));

    expect(parser.canParse(article, createContext())).toBe(true);
    expect(parser.canParse(main, createContext())).toBe(true);
    expect(parser.canParse(directDiv, createContext())).toBe(true);
  });
}

function registerListCapTest() {
  it('creates a main-content section and caps list parsing to ten items', () => {
    const parser = new TextContentParser();
    const ctx = createContext();
    const main = document.createElement('main');
    const list = document.createElement('ul');

    for (let index = 0; index < 12; index += 1) {
      const item = document.createElement('li');
      item.textContent = `List item ${index + 1}`;
      list.append(item);
    }

    main.append(list);

    const result = parser.parse(main, ctx);
    const listItems = result.newSection?.children.filter((child) => child.type === 'field') ?? [];

    expect(result.newSection?.title).toBe('Основное содержимое');
    expect(listItems).toHaveLength(10);
    expect(listItems[0]).toMatchObject({
      contentRole: 'list-item',
      label: 'Список 1',
      value: 'List item 1',
    });
  });

  it('uses the preceding heading as the list label', () => {
    const parser = new TextContentParser();
    const ctx = createContext();
    const article = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = 'Checklist';
    const list = document.createElement('ul');
    const item = document.createElement('li');
    item.textContent = 'Long enough item';
    list.append(item);
    article.append(heading, list);

    const result = parser.parse(article, ctx);

    expect(result.newSection?.children[0]).toMatchObject({
      contentRole: 'list-item',
      label: 'Checklist 1',
    });
  });
}

function registerProcessedAndSkippedContentTest() {
  it('skips processed paragraphs and list surfaces without valid narrative items', () => {
    const parser = new TextContentParser();
    const ctx = createContext();
    const article = document.createElement('article');
    const processedParagraph = document.createElement('p');
    processedParagraph.textContent = 'Processed paragraph '.repeat(4);
    const skippedParagraph = document.createElement('p');
    skippedParagraph.textContent = 'Too short';
    const label = document.createElement('div');
    label.textContent = 'Not a heading';
    const emptyList = document.createElement('ul');
    emptyList.append(document.createElement('div'));
    const shortItemList = document.createElement('ol');
    const shortItem = document.createElement('li');
    shortItem.textContent = 'bad';
    shortItemList.append(shortItem);
    article.append(processedParagraph, skippedParagraph, label, emptyList, shortItemList);
    ctx.processedFieldElements.add(processedParagraph);

    const result = parser.parse(article, ctx);

    expect(result.newSection?.title).toBe('Статья');
    expect(result.newSection?.children).toEqual([]);
    expect(ctx.processedFieldElements.has(emptyList)).toBe(false);
    expect(ctx.processedFieldElements.has(shortItemList)).toBe(true);
  });
}

function registerHeadingTitleTest() {
  it('uses the first heading as the section title and parses paragraphs', () => {
    const parser = new TextContentParser();
    const ctx = createContext();
    const article = document.createElement('article');
    const heading = document.createElement('h2');
    heading.textContent = 'Reference';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Narrative paragraph '.repeat(10);
    article.append(heading, paragraph);

    const result = parser.parse(article, ctx);

    expect(result.newSection?.title).toBe('Reference');
    expect(result.newSection?.children[0]).toMatchObject({
      contentRole: 'paragraph',
      label: 'Текст',
    });
  });
}

function registerFallbackTitleTests() {
  it('falls back to generic titles when the first heading is empty', () => {
    const parser = new TextContentParser();
    const articleCtx = createContext();
    const article = document.createElement('article');
    const blankHeading = document.createElement('h2');
    blankHeading.textContent = '   ';
    article.append(blankHeading);

    const genericCtx = createContext();
    const genericDiv = document.createElement('div');
    genericDiv.append(document.createElement('p'), document.createElement('p'));

    expect(parser.parse(article, articleCtx).newSection?.title).toBe('Статья');
    expect(articleCtx.processedFieldElements.has(blankHeading)).toBe(false);
    expect(parser.parse(genericDiv, genericCtx).newSection?.title).toBe('Содержимое');
  });
}

describe('TextContentParser', () => {
  registerExcludePatternTest();
  registerNestedParagraphsTest();
  registerSectionAndDivShapeTests();
  registerListCapTest();
  registerProcessedAndSkippedContentTest();
  registerHeadingTitleTest();
  registerFallbackTitleTests();
});
