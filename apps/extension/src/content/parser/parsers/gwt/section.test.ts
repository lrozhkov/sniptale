// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initContext } from '../../dom-tree-parser/traversal';
import { GWTSectionParser, parseGwtSectionElement, updateSectionContext } from './section';

function registerParserCanParseTest() {
  it('matches section containers but skips comment list containers', () => {
    const parser = new GWTSectionParser();
    const ctx = initContext();
    const section = document.createElement('div');
    section.className = 'GAQEVERFM';
    const comments = document.createElement('div');
    comments.id = 'gwt-debug-CommentList';

    expect(parser.canParse(section, ctx)).toBe(true);
    expect(parser.canParse(comments, ctx)).toBe(false);
  });
}

function registerPendingFieldsSectionTest() {
  it('hydrates sections with pending fields that match by title', () => {
    const ctx = initContext();
    ctx.pendingFields = new Map([
      [
        'дополнительные параметры',
        [
          {
            type: 'field' as const,
            id: 'field-1',
            label: 'Стоимость',
            value: '500',
            valueType: 'string' as const,
            selector: '#value',
            selected: true,
          },
        ],
      ],
    ]);
    const section = document.createElement('div');
    section.id = 'gwt-debug-EmbeddedApplicationContent.dynamicFields';

    const result = parseGwtSectionElement(section, ctx);

    expect(result.newSection?.title).toBe('Дополнительные параметры');
    expect(result.newSection?.children).toEqual([
      expect.objectContaining({
        label: 'Стоимость',
        value: '500',
      }),
    ]);
    expect(ctx.pendingFields.size).toBe(0);
  });
}

function registerPendingFieldsReverseMatchTest() {
  it('hydrates sections when the pending title contains the section title as a broader phrase', () => {
    const ctx = initContext();
    ctx.pendingFields = new Map([
      [
        'комментарии по заявке',
        [
          {
            type: 'field' as const,
            id: 'field-2',
            label: 'Автор',
            value: 'Иван',
            valueType: 'string' as const,
            selector: '#comment',
            selected: true,
          },
        ],
      ],
    ]);
    const section = document.createElement('div');
    section.id = 'gwt-debug-EmbeddedApplicationContent.comments';

    const result = parseGwtSectionElement(section, ctx);

    expect(result.newSection?.title).toBe('Комментарии');
    expect(result.newSection?.children).toEqual([
      expect.objectContaining({
        label: 'Автор',
        value: 'Иван',
      }),
    ]);
    expect(ctx.pendingFields.size).toBe(0);
  });
}

function registerUnmatchedPendingFieldsTest() {
  it('keeps pending fields untouched when section titles do not match', () => {
    const ctx = initContext();
    ctx.pendingFields = new Map([
      [
        'несвязанный раздел',
        [
          {
            type: 'field' as const,
            id: 'field-3',
            label: 'Статус',
            value: 'Черновик',
            valueType: 'string' as const,
            selector: '#status',
            selected: true,
          },
        ],
      ],
    ]);
    const section = document.createElement('div');
    section.id = 'gwt-debug-EmbeddedApplicationContent.comments';

    const result = parseGwtSectionElement(section, ctx);

    expect(result.newSection?.children).toEqual([]);
    expect(ctx.pendingFields.size).toBe(1);
  });
}

function registerSectionContextTransitionTest() {
  it('closes the active section when a new section element is encountered', () => {
    const ctx = initContext();
    const first = document.createElement('div');
    first.className = 'GAQEVERFM';
    first.id = 'first-section';
    const firstTitle = document.createElement('div');
    firstTitle.id = 'gwt-debug-title';
    firstTitle.textContent = 'Первый раздел';
    first.append(firstTitle);
    document.body.append(first);

    const second = document.createElement('div');
    second.className = 'GAQEVERFM';
    second.id = 'second-section';
    const secondTitle = document.createElement('div');
    secondTitle.id = 'gwt-debug-title';
    secondTitle.textContent = 'Второй раздел';
    second.append(secondTitle);
    document.body.append(second);

    parseGwtSectionElement(first, ctx);
    expect(ctx.currentSection?.title).toBe('Первый раздел');

    updateSectionContext(second, ctx);

    expect(ctx.currentSection).toBeNull();
    expect(ctx.sectionElements).toHaveLength(0);
  });
}

function registerSectionContextGuardTests() {
  it('keeps context when re-entering the same section and ignores non-element original nodes', () => {
    const ctx = initContext();
    const section = document.createElement('div');
    section.className = 'GAQEVERFM extra-shell';
    const title = document.createElement('div');
    title.id = 'gwt-debug-title';
    title.textContent = 'Один раздел';
    section.append(title);
    document.body.append(section);

    parseGwtSectionElement(section, ctx);
    updateSectionContext(section, ctx);
    expect(ctx.currentSection?.title).toBe('Один раздел');
    expect(ctx.sectionElements).toHaveLength(1);

    const textNode = document.createTextNode('not-an-element');
    const virtualNode = document.createElement('div');
    ctx.getOriginalElementFn = () => textNode;
    updateSectionContext(virtualNode, ctx);

    expect(ctx.currentSection?.title).toBe('Один раздел');
    expect(ctx.sectionElements).toHaveLength(1);
  });
}

function appendSection(id: string, titleText: string) {
  const section = document.createElement('div');
  section.className = 'GAQEVERFM';
  section.id = id;
  const title = document.createElement('div');
  title.id = `gwt-debug-title-${id}`;
  title.textContent = titleText;
  section.append(title);
  document.body.append(section);
  return section;
}

function registerSectionContextRestoreTests() {
  it('restores the previous tracked section when leaving a nested section', () => {
    const ctx = initContext();
    const first = appendSection('first', 'Первый раздел');
    const second = appendSection('second', 'Второй раздел');
    const third = appendSection('third', 'Третий раздел');

    parseGwtSectionElement(first, ctx);
    parseGwtSectionElement(second, ctx);
    updateSectionContext(third, ctx);

    expect(ctx.currentSection?.title).toBe('Первый раздел');
    expect(ctx.sectionElements).toEqual([first]);
  });

  it('clears currentSection when the previous tracked section is no longer present in structure', () => {
    const ctx = initContext();
    const orphan = appendSection('orphan', 'Потерянный раздел');
    const active = appendSection('active', 'Активный раздел');
    const next = appendSection('next', 'Следующий раздел');

    ctx.sectionElements.push(orphan, active);
    ctx.currentSection = {
      type: 'section',
      id: 'section-active',
      title: 'Активный раздел',
      children: [],
      selected: true,
      kind: 'record',
    };

    updateSectionContext(next, ctx);

    expect(ctx.currentSection).toBeNull();
    expect(ctx.sectionElements).toEqual([orphan]);
  });
}

describe('gwt section parser', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerParserCanParseTest();
  registerPendingFieldsSectionTest();
  registerPendingFieldsReverseMatchTest();
  registerUnmatchedPendingFieldsTest();
  registerSectionContextTransitionTest();
  registerSectionContextGuardTests();
  registerSectionContextRestoreTests();
});
