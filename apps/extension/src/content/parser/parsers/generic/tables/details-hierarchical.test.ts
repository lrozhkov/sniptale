// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { initContext } from '../../../dom-tree-parser/traversal';

const { extractVirtualIframeContentMock, resolveWideAttributeFrameMock } = vi.hoisted(() => ({
  extractVirtualIframeContentMock: vi.fn(),
  resolveWideAttributeFrameMock: vi.fn(),
}));

vi.mock('../../gwt/attr-list-wide.helpers', () => ({
  extractVirtualIframeContent: extractVirtualIframeContentMock,
  resolveWideAttributeFrame: resolveWideAttributeFrameMock,
}));

import { DetailsHierarchicalTableParser } from './details-hierarchical';

function appendElement<T extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: T,
  props?: Partial<HTMLElementTagNameMap[T]>
): HTMLElementTagNameMap[T] {
  const element = document.createElement(tagName);
  if (props) {
    Object.assign(element, props);
  }
  parent.append(element);
  return element;
}

function createContext() {
  return initContext(undefined, undefined, {
    pageHostname: 'example.test',
    pageTitle: 'Карточка запроса',
    pageUrl: 'https://example.test/service-call',
  });
}

function createSection(title: string): SectionNode {
  return {
    type: 'section',
    id: `${title}-section`,
    title,
    children: [],
    selected: true,
  };
}

function appendDetailsRow(
  table: HTMLElement,
  label: string,
  value?: string,
  configureValueCell?: (valueCell: HTMLElement) => void
) {
  const row = appendElement(table, 'div', { className: 'Details__row' });
  appendElement(row, 'div', { className: 'Details__colPage', textContent: label });
  if (value !== undefined) {
    const valueCell = appendElement(row, 'div', {
      className: 'Details__colPage',
      textContent: value,
    });
    configureValueCell?.(valueCell);
  }
  return row;
}

function buildTitledTable(titleText: string) {
  const block = appendElement(document.body, 'section', { className: 'Block__block' });
  const title = appendElement(block, 'div', { className: 'DetailsHead__routeTitle' });
  title.textContent = titleText;
  return appendElement(block, 'div', { className: 'Details__hierarchicalTable' });
}

beforeEach(() => {
  extractVirtualIframeContentMock.mockReset();
  resolveWideAttributeFrameMock.mockReset();
  resolveWideAttributeFrameMock.mockReturnValue({
    iframeContainer: null,
    isVirtualIframe: false,
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

function registerCanParseTests() {
  it('requires an unprocessed hierarchical table with detail rows', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = appendElement(document.body, 'div', {
      className: 'Details__hierarchicalTable',
    });
    appendDetailsRow(table, 'Статус', 'Открыт');

    expect(parser.canParse(table, ctx)).toBe(true);

    ctx.processedFieldElements.add(table);
    expect(parser.canParse(table, ctx)).toBe(false);
    expect(parser.canParse(document.body, createContext())).toBe(false);
  });
}

function registerSectionReuseAndLinkTests() {
  it('reuses the current titled section and parses link values', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const section = createSection('Маршрут');
    ctx.currentSection = section;
    ctx.result.structure.push(section);

    const table = buildTitledTable('Маршрут');
    appendDetailsRow(table, 'Ссылка:', '', (valueCell) => {
      valueCell.textContent = '';
      appendElement(valueCell, 'a', {
        href: 'https://example.test/details',
        textContent: 'Открыть карточку',
      });
    });

    const result = parser.parse(table, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Ссылка',
        value: 'Открыть карточку',
        linkRef: 'https://example.test/details',
      }),
    ]);
    expect(section.children).toHaveLength(1);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection).toBe(section);
  });
}

function registerFallbackAndSkipTests() {
  it('creates a fallback details section and skips invalid rows', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = appendElement(document.body, 'div', {
      className: 'Details__hierarchicalTable',
    });
    appendDetailsRow(table, 'Only label');
    appendDetailsRow(table, 'Совпадает:', 'Совпадает');
    appendDetailsRow(table, 'Статус:', 'Открыт');

    const result = parser.parse(table, ctx);

    expect(ctx.result.structure[0]).toMatchObject({ title: 'Детали' });
    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Статус',
        value: 'Открыт',
      }),
    ]);
    expect(ctx.processedFieldElements.has(table)).toBe(true);
  });
}

function registerEmptyAndSectionFallbackTests() {
  it('returns an empty result when no rows survive parsing', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = appendElement(document.body, 'div', {
      className: 'Details__hierarchicalTable',
    });
    appendDetailsRow(table, 'Совпадает:', 'Совпадает');

    expect(parser.parse(table, ctx)).toEqual({});
    expect(ctx.result.structure[0]).toMatchObject({ title: 'Детали', children: [] });
  });

  it('creates a new titled section when the current section title differs', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const existingSection = createSection('Другая секция');
    ctx.currentSection = existingSection;
    ctx.result.structure.push(existingSection);
    const table = buildTitledTable('Маршрут');
    appendDetailsRow(table, 'Статус:', 'Открыт');

    parser.parse(table, ctx);

    expect(ctx.result.structure).toHaveLength(2);
    expect(ctx.currentSection).not.toBe(existingSection);
    expect(ctx.currentSection).toMatchObject({ title: 'Маршрут' });
  });
}

function registerVirtualIframeTest() {
  it('extracts virtual iframe content through the wide-attribute helper seam', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = buildTitledTable('Дополнительные параметры');
    appendDetailsRow(table, 'Описание:', '', (valueCell) => {
      const iframeContainer = appendElement(valueCell, 'div');
      iframeContainer.setAttribute('data-virtual-iframe', 'true');
      resolveWideAttributeFrameMock.mockReturnValue({
        iframeContainer,
        isVirtualIframe: true,
      });
      extractVirtualIframeContentMock.mockReturnValue('Извлечённый текст iframe');
    });

    const result = parser.parse(table, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Описание',
        value: 'Извлечённый текст iframe',
        valueType: 'string',
      }),
    ]);
  });
}

describe('DetailsHierarchicalTableParser', () => {
  registerCanParseTests();
  registerSectionReuseAndLinkTests();
  registerFallbackAndSkipTests();
  registerEmptyAndSectionFallbackTests();
  registerVirtualIframeTest();
});
