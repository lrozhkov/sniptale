// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function appendDetailsRow(table: HTMLElement, label: string, value?: string) {
  const row = appendElement(table, 'div', { className: 'Details__row' });
  appendElement(row, 'div', { className: 'Details__colPage', textContent: label });
  if (value !== undefined) {
    appendElement(row, 'div', { className: 'Details__colPage', textContent: value });
  }
  return row;
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

function registerEmptyVirtualIframeFallbackTest() {
  it('drops virtual-iframe rows when extracted iframe content is empty', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = appendElement(document.body, 'div', {
      className: 'Details__hierarchicalTable',
    });
    const row = appendDetailsRow(table, 'Описание:', '');
    const valueCell = row.children[1] as HTMLElement;
    const iframeContainer = appendElement(valueCell, 'div');
    iframeContainer.setAttribute('data-virtual-iframe', 'true');

    resolveWideAttributeFrameMock.mockReturnValue({
      iframeContainer,
      isVirtualIframe: true,
    });
    extractVirtualIframeContentMock.mockReturnValue('');

    expect(parser.parse(table, ctx)).toEqual({});
  });
}

function registerProcessedRowSkipTest() {
  it('skips rows that are already marked as processed', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = appendElement(document.body, 'div', {
      className: 'Details__hierarchicalTable',
    });
    const processedRow = appendDetailsRow(table, 'Статус:', 'Открыт');
    appendDetailsRow(table, 'Ответственный:', 'Иван Иванов');
    ctx.processedFieldElements.add(processedRow);

    const result = parser.parse(table, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Ответственный',
        value: 'Иван Иванов',
      }),
    ]);
  });
}

function registerMissingValueCellSkipTest() {
  it('skips rows that do not expose a second value column', () => {
    const parser = new DetailsHierarchicalTableParser();
    const ctx = createContext();
    const table = appendElement(document.body, 'div', {
      className: 'Details__hierarchicalTable',
    });
    appendDetailsRow(table, 'Только метка');
    appendDetailsRow(table, 'Статус:', 'Открыт');

    const result = parser.parse(table, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Статус',
        value: 'Открыт',
      }),
    ]);
  });
}

describe('details-hierarchical-table branch coverage', () => {
  registerEmptyVirtualIframeFallbackTest();
  registerProcessedRowSkipTest();
  registerMissingValueCellSkipTest();
});
