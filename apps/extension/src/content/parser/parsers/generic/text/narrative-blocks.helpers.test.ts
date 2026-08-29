// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../../types';
import { setGetOriginalElementFn } from '../../../dom-utils/dom-helpers';
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
  setGetOriginalElementFn(null);
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

    const extraction = extract(root, {
      fallbackTitle: 'Section fallback',
      minParagraphLength: 20,
    });

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
    const codeLink = document.createElement('a');
    codeLink.href = 'https://example.test/not-navigation';
    codeLink.textContent = ' source';
    codeBlock.append(codeLink);

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
    expect(extraction.blocks.filter((block) => block.kind === 'code')).toEqual(
      expect.arrayContaining([expect.not.objectContaining({ inlineContent: expect.anything() })])
    );
  });

  it('preserves safe links, original image URLs, ordered lists, and lower heading levels', () => {
    const root = document.createElement('main');
    appendTextElement(root, 'h2', 'Reference');
    appendTextElement(root, 'h4', 'Further reading');

    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.setAttribute('href', '/standards?format=html');
    link.textContent = 'Web standards';
    const image = document.createElement('img');
    image.setAttribute('src', '/images/diagram.png');
    image.alt = 'Architecture diagram';
    paragraph.append('Read ', link, ' and inspect ', image, '.');

    const list = document.createElement('ol');
    const item = document.createElement('li');
    const itemLink = document.createElement('a');
    itemLink.href = 'https://docs.example.test/first';
    itemLink.textContent = 'First step';
    item.append(itemLink);
    list.append(item);
    root.append(paragraph, list);

    const extraction = extract(root, { minParagraphLength: 3 });
    const paragraphBlock = extraction.blocks.find((block) => block.kind === 'paragraph');
    const listBlock = extraction.blocks.find((block) => block.kind === 'list');

    expect(extraction.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          headingLevel: 4,
          kind: 'heading',
          text: 'Further reading',
        }),
      ])
    );
    expect(paragraphBlock?.inlineContent).toEqual(
      expect.arrayContaining([
        {
          kind: 'link',
          text: 'Web standards',
          url: 'https://example.test/standards?format=html',
        },
        {
          alt: 'Architecture diagram',
          kind: 'image',
          sourceUrl: 'https://example.test/images/diagram.png',
        },
      ])
    );
    expect(listBlock).toMatchObject({
      itemInlineContent: [
        [
          {
            kind: 'link',
            text: 'First step',
            url: 'https://docs.example.test/first',
          },
        ],
      ],
      listStyle: 'ordered',
    });
  });

  it('retains standalone network images without emitting active URL schemes', () => {
    const root = document.createElement('main');
    appendTextElement(root, 'h2', 'Gallery');
    const safeImage = document.createElement('img');
    safeImage.src = 'https://cdn.example.test/photo.jpg';
    safeImage.alt = 'Photo';
    const unsafeLink = document.createElement('a');
    unsafeLink.setAttribute('href', 'javascript:alert(1)');
    unsafeLink.textContent = 'Unsafe destination';
    const paragraph = document.createElement('p');
    paragraph.append(unsafeLink, ' remains plain text in the exported document.');
    root.append(safeImage, paragraph);

    const extraction = extract(root, { minParagraphLength: 3 });
    const imageBlock = extraction.blocks.find((block) =>
      block.inlineContent?.some((node) => node.kind === 'image')
    );
    const unsafeBlock = extraction.blocks.find((block) => block.text?.includes('Unsafe'));

    expect(imageBlock?.inlineContent).toEqual([
      {
        alt: 'Photo',
        kind: 'image',
        sourceUrl: 'https://cdn.example.test/photo.jpg',
      },
    ]);
    expect(unsafeBlock?.inlineContent).toEqual([
      {
        kind: 'text',
        text: 'Unsafe destination remains plain text in the exported document.',
      },
    ]);
  });

  it('preserves mixed anchor content order and keeps unsafe anchor captions', () => {
    const root = document.createElement('main');
    appendTextElement(root, 'h2', 'Linked media');

    const safeParagraph = document.createElement('p');
    const safeLink = document.createElement('a');
    safeLink.href = 'https://example.test/details';
    const safeImage = document.createElement('img');
    safeImage.src = 'https://cdn.example.test/safe.png';
    safeImage.alt = 'Safe image';
    safeLink.append(safeImage, ' Safe caption');
    safeParagraph.append(safeLink);

    const unsafeParagraph = document.createElement('p');
    const unsafeLink = document.createElement('a');
    unsafeLink.setAttribute('href', 'javascript:alert(1)');
    const unsafeImage = document.createElement('img');
    unsafeImage.src = 'https://cdn.example.test/unsafe.png';
    unsafeImage.alt = 'Unsafe image';
    unsafeLink.append(unsafeImage, ' Unsafe caption');
    unsafeParagraph.append(unsafeLink);
    root.append(safeParagraph, unsafeParagraph);

    const extraction = extract(root, { minParagraphLength: 3 });
    const paragraphs = extraction.blocks.filter((block) => block.kind === 'paragraph');

    expect(paragraphs[0]?.inlineContent).toEqual([
      {
        alt: 'Safe image',
        kind: 'image',
        linkUrl: 'https://example.test/details',
        sourceUrl: 'https://cdn.example.test/safe.png',
      },
      {
        kind: 'link',
        text: ' Safe caption',
        url: 'https://example.test/details',
      },
    ]);
    expect(paragraphs[1]?.inlineContent).toEqual([
      {
        alt: 'Unsafe image',
        kind: 'image',
        sourceUrl: 'https://cdn.example.test/unsafe.png',
      },
      { kind: 'text', text: ' Unsafe caption' },
    ]);
  });

  it('prefers the live image URL when the inert snapshot only retains a placeholder', () => {
    const root = document.createElement('main');
    appendTextElement(root, 'h2', 'Gallery');
    const virtualImage = document.createElement('img');
    virtualImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    virtualImage.alt = 'Lazy image';
    const originalImage = document.createElement('img');
    originalImage.src = 'https://cdn.example.test/original.jpg';
    root.append(virtualImage);
    setGetOriginalElementFn((node) => (node === virtualImage ? originalImage : node));

    const extraction = extract(root, { minParagraphLength: 3 });

    expect(extraction.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inlineContent: [
            {
              alt: 'Lazy image',
              kind: 'image',
              sourceUrl: 'https://cdn.example.test/original.jpg',
            },
          ],
          kind: 'paragraph',
        }),
      ])
    );
  });
}

describe('narrative-blocks helpers', () => {
  registerFallbackSectionTests();
  registerSkipAndFilterTests();
  registerNarrativeKindTests();
});
