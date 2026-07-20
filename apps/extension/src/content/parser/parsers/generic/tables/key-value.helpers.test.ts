// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import {
  extractDataTableRows,
  extractTableHeaders,
  resolveTableHeaderRow,
} from './key-value.helpers';

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
      title: 'Key-value table',
      structure: [],
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
        title: 'Key-value table',
        url: 'https://example.test/table',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerHeaderRowTests() {
  it('prefers thead header rows and falls back to the first tr with th cells', () => {
    const tableWithThead = document.createElement('table');
    const thead = document.createElement('thead');
    const theadRow = document.createElement('tr');
    theadRow.append(document.createElement('th'), document.createElement('th'));
    thead.append(theadRow);
    tableWithThead.append(thead);

    const fallbackTable = document.createElement('table');
    const fallbackRow = document.createElement('tr');
    fallbackRow.append(document.createElement('th'), document.createElement('th'));
    fallbackTable.append(fallbackRow);

    const noHeaderTable = document.createElement('table');
    const bodyRow = document.createElement('tr');
    bodyRow.append(document.createElement('td'), document.createElement('td'));
    noHeaderTable.append(bodyRow);

    expect(resolveTableHeaderRow(tableWithThead)).toBe(theadRow);
    expect(resolveTableHeaderRow(fallbackTable)).toBe(fallbackRow);
    expect(resolveTableHeaderRow(noHeaderTable)).toBeNull();
  });

  it('extracts only non-empty header text', () => {
    const row = document.createElement('tr');
    const first = document.createElement('th');
    first.textContent = 'Name';
    const second = document.createElement('th');
    second.textContent = ' ';
    const third = document.createElement('th');
    third.textContent = 'Status';
    row.append(first, second, third);

    expect(extractTableHeaders(row)).toEqual(['Name', 'Status']);
  });
}

function registerDataRowExtractionTest() {
  it('extracts visible data rows, inferred cell types, and skips empty or hidden rows', () => {
    const { headerRow, table } = createDataRowExtractionTable();

    const rows = extractDataTableRows({
      ctx: createContext(),
      headerRow,
      headers: ['Name', 'Status', 'Count'],
      table,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      data: {
        Name: 'Item 1',
        Status: 'да',
        Count: '42',
      },
      cellTypes: {
        Name: 'link',
        Status: 'boolean',
        Count: 'number',
      },
    });
  });
}

function createTextCell(tagName: 'td' | 'th', text: string): HTMLTableCellElement {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
}

function createLinkedNameCell(): HTMLTableCellElement {
  const nameCell = document.createElement('td');
  const link = document.createElement('a');
  link.href = 'https://example.test/item';
  link.textContent = 'Item 1';
  nameCell.append(link);
  return nameCell;
}

function createDataRowExtractionTable() {
  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.append(
    createTextCell('th', 'Name'),
    createTextCell('th', 'Status'),
    createTextCell('th', 'Count')
  );

  const visibleRow = document.createElement('tr');
  visibleRow.append(createLinkedNameCell(), createTextCell('td', 'да'), createTextCell('td', '42'));

  const hiddenRow = document.createElement('tr');
  hiddenRow.style.display = 'none';
  hiddenRow.append(document.createElement('td'), document.createElement('td'));

  const emptyRow = document.createElement('tr');
  emptyRow.append(document.createElement('td'), document.createElement('td'));

  table.append(headerRow, visibleRow, hiddenRow, emptyRow);
  return { headerRow, table };
}

describe('key-value-table helpers', () => {
  registerHeaderRowTests();
  registerDataRowExtractionTest();
});
