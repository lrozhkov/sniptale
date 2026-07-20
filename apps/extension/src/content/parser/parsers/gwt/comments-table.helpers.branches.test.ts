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
    result: { context: '', structure: [], title: '' },
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
  return appendElement(document.body, 'div', { id: 'comments' });
}

function appendComment(container: HTMLElement, id: string) {
  return appendElement(container, 'div', { id });
}

function appendAuthorWrapper(comment: HTMLElement) {
  return appendElement(comment, 'div', { className: 'Comment__author' });
}

function appendDate(comment: HTMLElement, value: string) {
  appendElement(comment, 'div', {
    className: 'Comment__date',
    textContent: value,
  });
}

function appendText(comment: HTMLElement, value?: string) {
  return appendElement(comment, 'div', {
    className: 'Comment__text',
    ...(value === undefined ? {} : { textContent: value }),
  });
}

function registerFallbackAuthorAndMissingTextTests() {
  it('drops comments when author fallbacks resolve to empty text or comment text is missing', () => {
    const container = buildCommentContainer();

    const emptyAuthor = appendComment(container, 'comment$empty-author');
    const authorEl = appendAuthorWrapper(emptyAuthor);
    appendElement(authorEl, 'span', { className: 'userAvatar', textContent: 'avatar' });
    appendDate(emptyAuthor, '04.04.2026');
    appendText(emptyAuthor, 'Текст без автора');

    const emptyNameSpan = appendComment(container, 'comment$empty-name');
    const spanAuthor = appendAuthorWrapper(emptyNameSpan);
    const authorLink = appendElement(spanAuthor, 'a');
    const nameSpan = appendElement(authorLink, 'span', { textContent: '' });
    nameSpan.setAttribute('__code', 'name');
    appendDate(emptyNameSpan, '04.04.2026');
    appendText(emptyNameSpan, 'Текст с пустым именем');

    const missingText = appendComment(container, 'comment$missing-text');
    const linkAuthor = appendElement(appendAuthorWrapper(missingText), 'a');
    linkAuthor.title = 'Автор без текста';
    appendDate(missingText, '04.04.2026');

    expect(parseCommentList(container, createTraversalContext())).toBeNull();
  });
}

function registerIframeFallbackWithoutUuidTest() {
  it('uses the generic froala placeholder when iframe content is unavailable and uuid is missing', () => {
    const container = buildCommentContainer();
    const comment = appendComment(container, 'comment$iframe-no-uuid');
    const authorLink = appendElement(appendAuthorWrapper(comment), 'a');
    authorLink.title = 'Павел';
    appendDate(comment, '05.04.2026');
    const textEl = appendText(comment);
    const iframe = appendElement(textEl, 'iframe');
    iframe.src = 'https://external.example/editor';

    const table = parseCommentList(container, createTraversalContext());

    expect(table?.rows).toEqual([
      expect.objectContaining({
        data: {
          Автор: 'Павел',
          Дата: '05.04.2026',
          Текст: '[Froala Editor - содержимое недоступно]',
        },
      }),
    ]);
  });
}

describe('gwt comments table helpers branches', () => {
  beforeEach(() => {
    setGetOriginalElementFn((node) => node);
  });

  afterEach(() => {
    document.body.replaceChildren();
    setGetOriginalElementFn(null);
  });

  registerFallbackAuthorAndMissingTextTests();
  registerIframeFallbackWithoutUuidTest();
});
