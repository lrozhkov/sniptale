// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setGetOriginalElementFn } from '../../dom-utils/dom-helpers';
import type { TraversalContext } from '../types';
import { parseCommentList } from './comments-table.helpers';

function createTraversalContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 0,
    globalTableIndex: 0,
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: '',
      structure: [],
      title: '',
    },
    sectionElements: [],
    sectionIndex: 0,
  };
}

function appendElement<K extends keyof HTMLElementTagNameMap>(
  parent: ParentNode,
  tagName: K,
  props?: Partial<HTMLElementTagNameMap[K]>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }

  parent.append(element);
  return element;
}

function buildCommentContainer() {
  return appendElement(document.body, 'div', {
    id: 'comments',
  });
}

function appendAuthor(comment: HTMLElement, author: string) {
  const authorEl = appendElement(comment, 'div', {
    className: 'Comment__author',
  });
  const link = appendElement(authorEl, 'a', {
    title: author,
  });
  appendElement(link, 'span', {
    textContent: author,
  });
}

function appendDate(comment: HTMLElement, dateText: string) {
  appendElement(comment, 'div', {
    className: 'Comment__date',
    textContent: dateText,
  });
}

function appendText(comment: HTMLElement) {
  return appendElement(comment, 'div', {
    className: 'Comment__text',
  });
}

function appendVirtualFroala(textEl: HTMLElement, uuid: string, text: string) {
  const container = appendElement(textEl, 'div');
  container.setAttribute('data-virtual-iframe', 'true');
  const view = appendElement(container, 'div', {
    className: 'fr-view',
    textContent: `${text} `,
  });
  const image = appendElement(view, 'img');
  image.src = `https://example.test/file?uuid=file$${uuid}`;
}

function appendAvatarOnlyComment(container: HTMLElement) {
  const comment = appendElement(container, 'div', {
    id: 'comment$4',
  });
  const authorEl = appendElement(comment, 'div', {
    className: 'Comment__author',
    textContent: '  Мария Смирнова  ',
  });
  appendElement(authorEl, 'span', {
    className: 'userAvatar',
    textContent: 'avatar',
  });
  appendText(comment).textContent = 'Текст без даты';
}

function appendNameSpanFallbackComment(container: HTMLElement) {
  const comment = appendElement(container, 'div', {
    id: 'comment$5',
  });
  const spanAuthor = appendElement(comment, 'div', {
    className: 'Comment__author',
  });
  const authorLink = appendElement(spanAuthor, 'a');
  const authorName = appendElement(authorLink, 'span', {
    textContent: 'ignored',
  });
  authorName.setAttribute('__code', 'name');
  appendText(comment).textContent = 'Комментарий со span-именем';
}

function appendBrokenVirtualComment(container: HTMLElement) {
  const comment = appendElement(container, 'div', {
    id: 'comment$6',
  });
  appendAuthor(comment, 'Ольга');
  appendDate(comment, '03.04.2026');
  const textEl = appendText(comment);
  const brokenVirtualContainer = appendElement(textEl, 'div', {
    id: 'iframe$virtual-comment',
  });
  Object.defineProperty(brokenVirtualContainer, 'querySelectorAll', {
    configurable: true,
    value: () => {
      throw new Error('broken virtual container');
    },
  });
}

function registerVirtualFroalaCommentTest() {
  it('parses comment rows with virtual froala content and attachments', () => {
    const container = buildCommentContainer();
    const comment = appendElement(container, 'div', {
      id: 'comment$1',
    });
    appendAuthor(comment, 'Иван Иванов');
    appendDate(comment, '31.03.2026');
    appendVirtualFroala(appendText(comment), 'attach123', 'Привет');

    const table = parseCommentList(container, createTraversalContext());

    expect(table?.rows).toHaveLength(1);
    expect(table?.rows[0]).toEqual(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            uuid: 'attach123',
          }),
        ],
        data: {
          Автор: 'Иван Иванов',
          Дата: '31.03.2026',
          Текст: 'Привет [file_attach123]',
        },
      })
    );
  });
}

function registerIframeFallbackCommentTest() {
  it('falls back to iframe uuid text when froala iframe content is unavailable', () => {
    const container = buildCommentContainer();
    const comment = appendElement(container, 'div', {
      id: 'comment$2',
    });
    appendAuthor(comment, 'Петров Петр');
    appendDate(comment, '01.04.2026');
    const textEl = appendText(comment);
    const iframe = appendElement(textEl, 'iframe');
    iframe.src = 'https://external.example/editor?uuid=deadbeef';

    const table = parseCommentList(container, createTraversalContext());

    expect(table?.rows[0]?.data['Текст']).toBe('[Froala Editor - uuid: deadbeef]');
    expect(table?.rows[0]?.attachments).toBeUndefined();
  });
}

function registerSkipDraftComposerTest() {
  it('skips draft composer rows and comments without author or text', () => {
    const container = buildCommentContainer();
    const draft = appendElement(container, 'div', {
      id: 'comment$currentUser',
    });
    appendElement(draft, 'form', {
      className: 'Comment__form',
    });

    const empty = appendElement(container, 'div', {
      id: 'comment$3',
    });
    appendDate(empty, '02.04.2026');
    appendText(empty).textContent = 'Без автора';

    expect(parseCommentList(container, createTraversalContext())).toBeNull();
  });
}

function registerAuthorFallbacksAndVirtualFallbacksTest() {
  it('uses author name fallbacks, preserves empty dates, and falls back for unsupported virtual containers', () => {
    const container = buildCommentContainer();
    appendAvatarOnlyComment(container);
    appendNameSpanFallbackComment(container);
    appendBrokenVirtualComment(container);

    const table = parseCommentList(container, createTraversalContext());

    expect(table?.rows).toEqual([
      expect.objectContaining({
        data: {
          Автор: 'Мария Смирнова',
          Дата: '',
          Текст: 'Текст без даты',
        },
      }),
      expect.objectContaining({
        data: {
          Автор: 'ignored',
          Дата: '',
          Текст: 'Комментарий со span-именем',
        },
      }),
      expect.objectContaining({
        data: {
          Автор: 'Ольга',
          Дата: '03.04.2026',
          Текст: '[Froala Editor - virtual container: iframe$virtual-comment]',
        },
      }),
    ]);
  });
}

describe('gwt comments table helpers', () => {
  beforeEach(() => {
    setGetOriginalElementFn((node) => node);
  });

  afterEach(() => {
    document.body.replaceChildren();
    setGetOriginalElementFn(null);
  });

  registerVirtualFroalaCommentTest();
  registerIframeFallbackCommentTest();
  registerSkipDraftComposerTest();
  registerAuthorFallbacksAndVirtualFallbacksTest();
});
