// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setGetOriginalElementFn } from '../../dom-utils/dom-helpers';
import type { TraversalContext } from '../types';
import { parseAttributes } from './attr-list.helpers';

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

function buildWideAttrList(options: {
  captionText?: string;
  richTextWideView?: boolean;
  valueId?: string;
  valueText?: string;
  contentBuilder?: (valueEl: HTMLElement) => void;
}) {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  const wideCell = document.createElement('td');
  wideCell.className = 'attrWide';

  if (options.captionText !== undefined) {
    const caption = document.createElement('div');
    caption.id = 'gwt-debug-caption';
    caption.textContent = options.captionText;
    wideCell.append(caption);
  }

  const valueEl = document.createElement('div');
  if (options.valueId) {
    valueEl.id = options.valueId;
  }
  if (options.richTextWideView) {
    valueEl.className = 'richTextWideView';
  }
  if (options.valueText !== undefined) {
    valueEl.textContent = options.valueText;
  }
  options.contentBuilder?.(valueEl);
  wideCell.append(valueEl);
  row.append(wideCell);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);

  return { table, valueEl };
}

function buildStandardAttrListRow(contentBuilder: (row: HTMLTableRowElement) => void) {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  contentBuilder(row);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);
  return table;
}

function createIframe(src = 'about:blank', bodyBuilder?: (body: HTMLElement) => void) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  if (bodyBuilder) {
    const iframeDocument = document.implementation.createHTMLDocument('iframe');
    bodyBuilder(iframeDocument.body);
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: iframeDocument,
    });
  }
  return iframe;
}

function registerVirtualFallbackAndDerivedLabelTest() {
  it('falls back for empty virtual iframes and derives labels from value ids when captions are absent', () => {
    const { table, valueEl } = buildWideAttrList({
      valueId: 'gwt-debug-serviceCallSummary-value',
      contentBuilder: (value) => {
        const virtualIframe = document.createElement('div');
        virtualIframe.id = 'iframe$empty-virtual';
        virtualIframe.setAttribute('data-virtual-iframe', 'true');
        value.append(virtualIframe);
      },
    });

    const fields = parseAttributes(table, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        evidence: [expect.objectContaining({ source: 'virtual-dom' })],
        label: 'service Call Summary',
        selector: expect.stringContaining('#gwt-debug-serviceCallSummary-value'),
        value: '[Froala Editor - содержимое недоступно]',
      }),
    ]);
    expect(valueEl.getAttribute('data-sniptale-id')).toBe(fields[0]?.id);
  });
}

function registerRealFroalaContentPathTest() {
  it('uses real iframe froala text when same-origin content is available', () => {
    const { table } = buildWideAttrList({
      captionText: 'Описание:',
      valueId: 'gwt-debug-description-value',
      contentBuilder: (value) => {
        const iframe = createIframe('about:blank', (body) => {
          const view = document.createElement('div');
          view.className = 'fr-view';
          view.textContent = 'Подробное описание';
          body.append(view);
        });
        value.append(iframe);
      },
    });

    expect(parseAttributes(table, createTraversalContext())).toEqual([
      expect.objectContaining({
        evidence: [expect.objectContaining({ source: 'virtual-dom' })],
        label: 'Описание',
        value: 'Подробное описание',
      }),
    ]);
  });
}

function registerNoLabelAndPlainWideSkipTests() {
  it('skips rich-text iframe values without a usable label and skips plain wide mirrors or empties', () => {
    const unlabeledWide = buildWideAttrList({
      richTextWideView: true,
      contentBuilder: (value) => {
        value.append(
          createIframe('about:blank', (body) => {
            const view = document.createElement('div');
            view.className = 'fr-view';
            view.textContent = 'Безымянный текст';
            body.append(view);
          })
        );
      },
    });
    const mirroredWide = buildWideAttrList({
      captionText: 'Описание:',
      valueId: 'gwt-debug-description-value',
      valueText: 'Описание',
    });
    const emptyWide = buildWideAttrList({
      captionText: 'Описание:',
      valueId: 'gwt-debug-description-value',
      valueText: '',
    });

    expect(parseAttributes(unlabeledWide.table, createTraversalContext())).toEqual([]);
    expect(parseAttributes(mirroredWide.table, createTraversalContext())).toEqual([]);
    expect(parseAttributes(emptyWide.table, createTraversalContext())).toEqual([]);
  });
}

function registerPlainWideTextValueTest() {
  it('parses plain wide text values when no iframe is present', () => {
    const { table } = buildWideAttrList({
      valueId: 'gwt-debug-requestSummary-value',
      valueText: 'Сводка готова',
    });

    expect(parseAttributes(table, createTraversalContext())).toEqual([
      expect.objectContaining({
        label: 'request Summary',
        value: 'Сводка готова',
      }),
    ]);
  });
}

function registerMissingValueElementAndMalformedRowTests() {
  it('returns no fields for wide rows without value elements and malformed standard rows', () => {
    const tableWithoutValue = document.createElement('table');
    tableWithoutValue.className = 'attrList';
    const tbody = document.createElement('tbody');
    const row = document.createElement('tr');
    const wideCell = document.createElement('td');
    wideCell.className = 'attrWide';
    tbody.append(row);
    row.append(wideCell);
    tableWithoutValue.append(tbody);
    document.body.append(tableWithoutValue);

    const malformedStandard = buildStandardAttrListRow((standardRow) => {
      const malformed = document.createElement('div');
      malformed.textContent = 'broken';
      standardRow.append(malformed);
    });

    expect(parseAttributes(tableWithoutValue, createTraversalContext())).toEqual([]);
    expect(parseAttributes(malformedStandard, createTraversalContext())).toEqual([]);
  });
}

function registerEmptyLinkTextSkipTest() {
  it('skips standard link rows when extracted link text is empty', () => {
    const table = buildStandardAttrListRow((row) => {
      const titleCell = document.createElement('td');
      titleCell.className = 'attrTitle';
      titleCell.textContent = 'Заявка:';
      const valueCell = document.createElement('td');
      valueCell.className = 'attrValue';
      const link = document.createElement('a');
      link.href = 'https://example.test/request/empty';
      valueCell.append(link);
      row.append(titleCell, valueCell);
    });

    expect(parseAttributes(table, createTraversalContext())).toEqual([]);
  });
}

function registerVirtualProcessedDescendantsTest() {
  it('marks virtual iframe descendants as processed when parsing falls back to the placeholder path', () => {
    const ctx = createTraversalContext();
    const { table } = buildWideAttrList({
      captionText: 'Описание:',
      valueId: 'gwt-debug-description-value',
      contentBuilder: (value) => {
        const virtualIframe = document.createElement('div');
        virtualIframe.id = 'iframe$virtual-description';
        virtualIframe.setAttribute('data-virtual-iframe', 'true');
        const editable = document.createElement('div');
        editable.className = 'fr-view';
        const child = document.createElement('span');
        child.textContent = '   ';
        editable.append(child);
        virtualIframe.append(editable);
        value.append(virtualIframe);
      },
    });

    const virtualIframe = table.querySelector('#iframe\\$virtual-description') as HTMLElement;
    const editable = virtualIframe.querySelector('.fr-view') as HTMLElement;
    const child = editable.querySelector('span') as HTMLElement;
    const fields = parseAttributes(table, ctx);

    expect(fields).toEqual([
      expect.objectContaining({
        evidence: [expect.objectContaining({ source: 'virtual-dom' })],
        label: 'Описание',
        value: '[Froala Editor - содержимое недоступно]',
      }),
    ]);
    expect(ctx.processedFieldElements.has(virtualIframe)).toBe(true);
    expect(ctx.processedFieldElements.has(editable)).toBe(true);
    expect(ctx.processedFieldElements.has(child)).toBe(true);
  });
}

describe('gwt attr list helper branches', () => {
  beforeEach(() => {
    setGetOriginalElementFn((node) => node);
  });

  afterEach(() => {
    document.body.replaceChildren();
    setGetOriginalElementFn(null);
  });

  registerVirtualFallbackAndDerivedLabelTest();
  registerRealFroalaContentPathTest();
  registerNoLabelAndPlainWideSkipTests();
  registerPlainWideTextValueTest();
  registerMissingValueElementAndMalformedRowTests();
  registerEmptyLinkTextSkipTest();
  registerVirtualProcessedDescendantsTest();
});
