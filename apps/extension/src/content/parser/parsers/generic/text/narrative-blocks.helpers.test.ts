// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { extractGenericNarrativeContent } from './narrative-blocks.helpers';

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
      title: 'Narrative content',
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
        title: 'Narrative content',
        url: 'https://example.test/article',
        warnings: [],
      },
      structure: [],
    } as ParsedDOMTree,
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

function appendTextElement(
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  text: string,
  className?: string
) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  parent.append(element);
  return element;
}

function extract(
  root: HTMLElement,
  options?: { fallbackTitle?: string; minParagraphLength?: number }
) {
  return extractGenericNarrativeContent({
    ctx: createContext(),
    root,
    fallbackTitle: options?.fallbackTitle ?? 'Fallback title',
    isContentElement: (element) => !element.classList.contains('skip-me'),
    ...(options?.minParagraphLength === undefined
      ? {}
      : { minParagraphLength: options.minParagraphLength }),
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerFallbackSectionTests() {
  it('creates a fallback section when content starts without headings', () => {
    const root = document.createElement('main');
    appendTextElement(
      root,
      'p',
      'This is a sufficiently long narrative paragraph that should be captured as content.'
    );

    const extraction = extract(root, { fallbackTitle: 'Fallback section' });

    expect(extraction.sections[0]).toMatchObject({
      title: 'Fallback section',
      kind: 'narrative',
    });
    expect(extraction.blocks[0]).toMatchObject({
      kind: 'heading',
      text: 'Fallback section',
    });
    expect(extraction.blocks[0]).not.toHaveProperty('evidence');
  });

  it('uses fallback title when the only h1 is empty but still keeps heading evidence', () => {
    const root = document.createElement('main');
    const heading = appendTextElement(root, 'h1', '   ');
    appendTextElement(
      root,
      'p',
      'Another sufficiently long narrative paragraph that should force fallback section creation.'
    );

    const extraction = extract(root, { fallbackTitle: 'Recovered title' });

    expect(extraction.sections[0]?.title).toBe('Recovered title');
    expect(extraction.blocks[0]).toMatchObject({
      kind: 'heading',
      text: 'Recovered title',
    });
    expect(extraction.blocks[0]?.evidence).toBeTruthy();
    expect(heading.getAttribute('data-sniptale-id')).toBeNull();
  });
}

function registerSkipAndFilterTests() {
  it('skips empty lists, short paragraphs, empty headings, and filtered nodes', () => {
    const root = document.createElement('main');
    appendTextElement(root, 'h2', '   ');
    appendTextElement(root, 'blockquote', 'ok');
    appendTextElement(root, 'p', 'too short');
    const list = document.createElement('ul');
    appendTextElement(list, 'div', 'Not a list item');
    root.append(list);
    appendTextElement(
      root,
      'p',
      'This paragraph is intentionally filtered out even though it is long enough.',
      'skip-me'
    );
    appendTextElement(
      root,
      'p',
      'This retained paragraph is long enough to produce a narrative paragraph block.'
    );

    const extraction = extract(root, { fallbackTitle: 'Section fallback', minParagraphLength: 20 });

    expect(extraction.sections).toHaveLength(1);
    expect(extraction.sections[0]?.title).toBe('Section fallback');
    expect(extraction.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph']);
    expect(extraction.blocks[1]).toMatchObject({
      text: 'This retained paragraph is long enough to produce a narrative paragraph block.',
    });
  });
}

function registerNarrativeKindTests() {
  it('creates list, quote, callout, and code blocks under an explicit heading section', () => {
    const root = document.createElement('main');
    appendTextElement(root, 'h2', 'Narrative heading');

    const list = document.createElement('ul');
    appendTextElement(list, 'li', 'First list item');
    appendTextElement(list, 'li', 'Second list item');
    root.append(list);

    appendTextElement(root, 'blockquote', 'Quoted text with enough content.');
    const callout = appendTextElement(root, 'div', 'Callout text with enough content.');
    callout.setAttribute('data-sc-normalized-kind', 'callout');
    appendTextElement(root, 'pre', 'const value = 1;');
    const codeBlock = appendTextElement(root, 'div', 'let count = 2;');
    codeBlock.setAttribute('data-sc-normalized-kind', 'code');

    const extraction = extract(root, { minParagraphLength: 3 });

    expect(extraction.sections[0]).toMatchObject({
      title: 'Narrative heading',
      kind: 'narrative',
    });
    expect(extraction.blocks.map((block) => block.kind)).toEqual([
      'heading',
      'list',
      'quote',
      'callout',
      'code',
      'code',
    ]);
  });
}

describe('narrative-blocks helpers', () => {
  registerFallbackSectionTests();
  registerSkipAndFilterTests();
  registerNarrativeKindTests();
});
