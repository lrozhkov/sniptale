// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initContext } from '../../dom-tree-parser/traversal';
import { GWTCommentsParser, parseGwtCommentsElement } from './comments';

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

function buildCommentContainer(id = 'comments') {
  return appendElement(document.body, 'div', { id });
}

function appendComment(container: HTMLElement, author: string, text: string) {
  const comment = appendElement(container, 'div', { id: `comment$${author}` });
  const authorEl = appendElement(comment, 'div', { className: 'Comment__author' });
  appendElement(authorEl, 'a', { title: author });
  appendElement(comment, 'div', { className: 'Comment__date', textContent: '2026-03-31' });
  appendElement(comment, 'div', { className: 'Comment__text', textContent: text });
  return comment;
}

function registerCanParseCoverageTest() {
  it('matches comment containers, skips processed containers, and skips nested elements inside them', () => {
    const parser = new GWTCommentsParser();
    const ctx = initContext();
    const container = buildCommentContainer('gwt-debug-CommentList');
    const nested = appendElement(container, 'div', { id: 'nested-element' });

    expect(parser.canParse(container, ctx)).toBe(true);

    ctx.processedCommentContainers.add(container);
    expect(parser.canParse(container, ctx)).toBe(false);
    expect(parser.canParse(nested, ctx)).toBe(false);
  });
}

function registerSectionReuseAndTitleFallbackTests() {
  it('reuses the current comment section, prefers title text, and handles empty comment tables', () => {
    const titledCtx = initContext();
    const titled = buildCommentContainer('comments');
    appendElement(titled, 'div', { className: 'Title__title', textContent: 'Обсуждение' });
    appendComment(titled, 'Иван', 'Готово');

    const titledResult = parseGwtCommentsElement(titled, titledCtx);

    expect(titledResult.tables).toHaveLength(1);
    expect(titledCtx.currentSection?.title).toBe('Обсуждение');

    const reuseCtx = initContext();
    const existingSection = {
      type: 'section' as const,
      id: 'section-comments',
      title: 'Комментарии',
      children: [],
      selected: true,
      kind: 'thread' as const,
    };
    reuseCtx.result.structure.push(existingSection);
    reuseCtx.currentSection = existingSection;

    const reuseContainer = buildCommentContainer('comments');
    appendComment(reuseContainer, 'Петр', 'Есть вопрос');
    parseGwtCommentsElement(reuseContainer, reuseCtx);

    expect(reuseCtx.result.structure).toHaveLength(1);
    expect(existingSection.children).toHaveLength(1);

    const emptyCtx = initContext();
    const emptyContainer = buildCommentContainer('comments');
    appendElement(emptyContainer, 'div', { className: 'GAQEVERAM', textContent: '   ' });

    expect(parseGwtCommentsElement(emptyContainer, emptyCtx)).toEqual({});
    expect(emptyCtx.currentSection?.title).toBe('Комментарии');
  });
}

describe('gwt comments parser', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerCanParseCoverageTest();
  registerSectionReuseAndTitleFallbackTests();
});
