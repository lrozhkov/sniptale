// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setGetOriginalElementFn } from '../../dom-utils/dom-helpers';
import { extractTableHeaders, filterNonEmptyRows, parseGwtTableRows } from './table.helpers';

function buildTable() {
  const table = document.createElement('table');
  table.className = 'cellTableWidget';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  thead.append(headerRow);
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  document.body.append(table);
  return { headerRow, table, tbody };
}

function appendHeader(parent: HTMLElement, text: string) {
  const th = document.createElement('th');
  th.textContent = text;
  parent.append(th);
  return th;
}

function appendBodyRow(parent: HTMLElement, values: string[]) {
  const row = document.createElement('tr');
  row.className = 'tableRow';
  values.forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  });
  parent.append(row);
  return row;
}

function registerHeaderExtractionTest() {
  it('extracts headers and skips control-only columns', () => {
    const { headerRow, table } = buildTable();
    appendHeader(headerRow, '▾');
    appendHeader(headerRow, 'Название');
    appendHeader(headerRow, 'Статус');

    expect(extractTableHeaders(table)).toEqual({
      headerIndices: [1, 2],
      headers: ['Название', 'Статус'],
      totalHeaderCells: 3,
    });
  });
}

function registerRowParsingTest() {
  it('maps rows by header indices and sets sniptale ids', () => {
    const { headerRow, table, tbody } = buildTable();
    appendHeader(headerRow, '▾');
    appendHeader(headerRow, 'Название');
    appendHeader(headerRow, 'Статус');
    const row = appendBodyRow(tbody, ['', 'Задача', 'Открыта']);

    const rows = parseGwtTableRows(table, ['Название', 'Статус'], [1, 2], 3);

    expect(rows).toEqual([
      expect.objectContaining({
        data: {
          Название: 'Задача',
          Статус: 'Открыта',
        },
      }),
    ]);
    expect(row.getAttribute('data-sniptale-id')).toBe(rows[0]?.id);
  });
}

function registerCompactRowsAndFilterTest() {
  it('supports compact rows and filters empty table rows', () => {
    const { tbody } = buildTable();
    appendBodyRow(tbody, ['Alpha', 'Ready']);
    appendBodyRow(tbody, ['', '']);

    const rows = parseGwtTableRows(
      tbody.closest('table') as HTMLTableElement,
      ['Название', 'Статус'],
      [0, 1],
      3
    );
    const filtered = filterNonEmptyRows(rows);

    expect(rows).toHaveLength(2);
    expect(filtered).toEqual([
      expect.objectContaining({
        data: {
          Название: 'Alpha',
          Статус: 'Ready',
        },
      }),
    ]);
  });
}

function registerMissingHeadersAndSkippedRowsTests() {
  it('returns null when headers are missing or only contain control glyphs, and skips invisible or empty rows', () => {
    const withoutHeader = buildTable();
    withoutHeader.table.querySelector('thead')?.remove();

    const controlOnly = buildTable();
    appendHeader(controlOnly.headerRow, '▾');
    appendHeader(controlOnly.headerRow, '▲');

    const visibleTable = buildTable();
    appendHeader(visibleTable.headerRow, 'Название');
    const hiddenRow = appendBodyRow(visibleTable.tbody, ['Hidden']);
    hiddenRow.setAttribute('style', 'display:none');
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'tableRow';
    visibleTable.tbody.append(emptyRow);

    expect(extractTableHeaders(withoutHeader.table)).toBeNull();
    expect(extractTableHeaders(controlOnly.table)).toBeNull();
    expect(parseGwtTableRows(visibleTable.table, ['Название'], [0], 1)).toEqual([]);
  });
}

function registerShortRowsSkipMissingCellsTest() {
  it('keeps only present cells when the body row is shorter than the header set', () => {
    const { headerRow, table, tbody } = buildTable();
    appendHeader(headerRow, 'Название');
    appendHeader(headerRow, 'Статус');
    appendBodyRow(tbody, ['Задача']);

    expect(parseGwtTableRows(table, ['Название', 'Статус'], [0, 1], 2)).toEqual([
      expect.objectContaining({
        data: {
          Название: 'Задача',
        },
      }),
    ]);
  });
}

describe('gwt table helpers', () => {
  beforeEach(() => {
    setGetOriginalElementFn((node) => node);
  });

  afterEach(() => {
    document.body.replaceChildren();
    setGetOriginalElementFn(null);
  });

  registerHeaderExtractionTest();
  registerRowParsingTest();
  registerCompactRowsAndFilterTest();
  registerMissingHeadersAndSkippedRowsTests();
  registerShortRowsSkipMissingCellsTest();
});
