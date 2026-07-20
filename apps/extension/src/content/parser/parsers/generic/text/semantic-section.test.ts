// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { SemanticSectionParser } from './semantic-section';

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
      title: 'Semantic section',
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
        title: 'Semantic section',
        url: 'https://example.test/article',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerCanParseTests() {
  it('parses semantic tags only when they contain supported content', () => {
    const parser = new SemanticSectionParser();
    const article = document.createElement('article');
    article.append(document.createElement('p'));
    const emptySection = document.createElement('section');
    const nav = document.createElement('nav');
    nav.append(document.createElement('p'));
    const plainDiv = document.createElement('div');

    expect(parser.canParse(article, createContext())).toBe(true);
    expect(parser.canParse(emptySection, createContext())).toBe(false);
    expect(parser.canParse(nav, createContext())).toBe(false);
    expect(parser.canParse(plainDiv, createContext())).toBe(false);
  });

  it('parses role-region surfaces even when they are not semantic tags', () => {
    const parser = new SemanticSectionParser();
    const region = document.createElement('div');
    region.setAttribute('role', 'region');

    expect(parser.canParse(region, createContext())).toBe(true);
  });
}

function registerHeadingAndAriaTitleTests() {
  it('prefers heading text, then aria-label, then aria-labelledby titles', () => {
    const parser = new SemanticSectionParser();

    const headingSection = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = 'Canonical heading';
    headingSection.append(heading, document.createElement('p'));

    const ariaLabelSection = document.createElement('section');
    ariaLabelSection.setAttribute('aria-label', 'Aria label');
    ariaLabelSection.append(document.createElement('p'));

    const labelSource = document.createElement('div');
    labelSource.id = 'section-title-source';
    labelSource.textContent = 'Labelled by title';
    const ariaLabelledSection = document.createElement('section');
    ariaLabelledSection.setAttribute('aria-labelledby', labelSource.id);
    ariaLabelledSection.append(document.createElement('p'));

    document.body.append(labelSource);

    expect(parser.parse(headingSection, createContext()).newSection?.title).toBe(
      'Canonical heading'
    );
    expect(parser.parse(ariaLabelSection, createContext()).newSection?.title).toBe('Aria label');
    expect(parser.parse(ariaLabelledSection, createContext()).newSection?.title).toBe(
      'Labelled by title'
    );
  });
}

function registerFallbackTitleTests() {
  it('falls back to localized semantic tag names and raw tag names when needed', () => {
    const parser = new SemanticSectionParser();

    const main = document.createElement('main');
    main.append(document.createElement('p'));
    const region = document.createElement('div');
    region.setAttribute('role', 'region');

    expect(parser.parse(main, createContext()).newSection?.title).toBe('Основное содержимое');
    expect(parser.parse(region, createContext()).newSection?.title).toBe('div');
  });
}

function registerResidualTitleFallbackTests() {
  it('falls back from long headings to aria labels and tag names', () => {
    const parser = new SemanticSectionParser();

    const longHeadingSection = document.createElement('section');
    const longHeading = document.createElement('h2');
    longHeading.textContent = 'A'.repeat(120);
    longHeadingSection.setAttribute('aria-label', 'Aria fallback');
    longHeadingSection.append(longHeading, document.createElement('p'));

    const longLabelSource = document.createElement('div');
    longLabelSource.id = 'section-long-label';
    longLabelSource.textContent = 'B'.repeat(120);
    const labelledSection = document.createElement('article');
    labelledSection.setAttribute('aria-labelledby', longLabelSource.id);
    labelledSection.append(document.createElement('p'));

    const missingLabelSection = document.createElement('section');
    missingLabelSection.setAttribute('aria-labelledby', 'missing-section-title');
    missingLabelSection.append(document.createElement('p'));

    document.body.append(longLabelSource);

    expect(parser.parse(longHeadingSection, createContext()).newSection?.title).toBe(
      'Aria fallback'
    );
    expect(parser.parse(labelledSection, createContext()).newSection?.title).toBe('Статья');
    expect(parser.parse(missingLabelSection, createContext()).newSection?.title).toBe('Раздел');
  });
}

function registerParseLifecycleTest() {
  it('registers the new section in traversal context and advances section tracking', () => {
    const parser = new SemanticSectionParser();
    const ctx = createContext();
    const sectionEl = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = 'Lifecycle title';
    sectionEl.append(heading, document.createElement('p'));

    const result = parser.parse(sectionEl, ctx);

    expect(result.newSection).toMatchObject({
      type: 'section',
      title: 'Lifecycle title',
      children: [],
      selected: true,
    });
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection).toBe(result.newSection);
    expect(ctx.sectionIndex).toBe(2);
    expect(ctx.sectionElements).toEqual([sectionEl]);
  });
}

describe('SemanticSectionParser', () => {
  registerCanParseTests();
  registerHeadingAndAriaTitleTests();
  registerFallbackTitleTests();
  registerResidualTitleFallbackTests();
  registerParseLifecycleTest();
});
