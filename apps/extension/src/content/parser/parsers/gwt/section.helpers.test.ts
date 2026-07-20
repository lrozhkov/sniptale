// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { findSectionTitle } from './section.helpers';

function registerPrioritizedTitleTest() {
  it('prefers explicit title elements over generic fallbacks', () => {
    const container = document.createElement('div');
    const title = document.createElement('div');
    title.id = 'gwt-debug-title';
    title.textContent = 'Список обращений';
    container.append(title);

    expect(findSectionTitle(container)).toBe('Список обращений');
  });
}

function registerEmbeddedContentTitleTest() {
  it('derives embedded application titles from known ids and readable fallbacks', () => {
    const known = document.createElement('div');
    known.id = 'gwt-debug-EmbeddedApplicationContent.comments';
    const unknown = document.createElement('div');
    unknown.id = 'gwt-debug-EmbeddedApplicationContent.customBlockName';

    expect(findSectionTitle(known)).toBe('Комментарии');
    expect(findSectionTitle(unknown)).toBe('Custom Block Name');
  });
}

function registerCodeAndFallbackTitleTests() {
  it('uses readable __code values and leaves title-attribute fallback available', () => {
    const coded = document.createElement('div');
    const codeNode = document.createElement('span');
    codeNode.setAttribute('__code', 'serviceCallSummary');
    coded.append(codeNode);

    const fallback = document.createElement('div');
    const label = document.createElement('td');
    label.className = 'attrTitle';
    label.textContent = 'Параметр:';
    fallback.append(label);

    const numeric = document.createElement('div');
    const titleAttr = document.createElement('div');
    titleAttr.title = '123456';
    titleAttr.textContent = '123456';
    numeric.append(titleAttr);

    expect(findSectionTitle(coded)).toBe('Service Call Summary');
    expect(findSectionTitle(fallback)).toBe('');
    expect(findSectionTitle(numeric)).toBe('123456');
  });
}

function registerEmbeddedSubstringAndShortIdTests() {
  it('matches embedded section substrings and ignores too-short embedded ids', () => {
    const substring = document.createElement('div');
    substring.id = 'gwt-debug-EmbeddedApplicationContent.customRichTextPanel';
    const short = document.createElement('div');
    short.id = 'gwt-debug-EmbeddedApplicationContent.x';

    expect(findSectionTitle(substring)).toBe('Описание');
    expect(findSectionTitle(short)).toBe('');
  });
}

function registerHeaderFallbackGuardTests() {
  it('ignores too-short title nodes, rejects long title attributes, and falls back to plain labels', () => {
    const shortTitle = document.createElement('div');
    const titleNode = document.createElement('div');
    titleNode.id = 'gwt-debug-title';
    titleNode.textContent = 'AB';
    shortTitle.append(titleNode);

    const fallback = document.createElement('div');
    const titleAttr = document.createElement('div');
    titleAttr.title = 'X'.repeat(120);
    titleAttr.textContent = titleAttr.title;
    fallback.append(titleAttr);
    const label = document.createElement('div');
    label.className = 'gwt-Label';
    label.textContent = 'Статус';
    fallback.append(label);

    expect(findSectionTitle(shortTitle)).toBe('');
    expect(findSectionTitle(fallback)).toBe('Статус');
  });
}

function registerEmptyFallbackTest() {
  it('returns an empty title when no fallback nodes are available', () => {
    expect(findSectionTitle(document.createElement('div'))).toBe('');
  });
}

function registerReadableLabelFallbackTest() {
  it('falls back to readable label text when generic labels are available', () => {
    const container = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'gwt-Label';
    label.textContent = 'Описание запроса';
    container.append(label);

    expect(findSectionTitle(container)).toBe('Описание запроса');
  });
}

describe('gwt section helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerPrioritizedTitleTest();
  registerEmbeddedContentTitleTest();
  registerCodeAndFallbackTitleTests();
  registerEmbeddedSubstringAndShortIdTests();
  registerHeaderFallbackGuardTests();
  registerEmptyFallbackTest();
  registerReadableLabelFallbackTest();
});
