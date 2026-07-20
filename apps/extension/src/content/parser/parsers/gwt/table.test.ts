// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initContext } from '../../dom-tree-parser/traversal';
import { GWTTableParser, parseGwtTableElement } from './table';

function buildCellTable(titleText = 'Список задач') {
  const wrapper = document.createElement('div');
  wrapper.className = 'GAQEVERFM';
  const title = document.createElement('div');
  title.className = 'GAQEVERAM';
  title.textContent = titleText;
  const table = document.createElement('table');
  table.className = 'cellTableWidget';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Название', 'Статус'].forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.append(th);
  });
  thead.append(headerRow);
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  row.className = 'tableRow';
  ['Задача', 'Открыта'].forEach((value) => {
    const td = document.createElement('td');
    td.textContent = value;
    row.append(td);
  });
  tbody.append(row);
  table.append(thead, tbody);
  wrapper.append(title, table);
  document.body.append(wrapper);
  return table;
}

function registerParserCanParseTest() {
  it('matches cellTableWidget tables unless already processed and delegates parse()', () => {
    const parser = new GWTTableParser();
    const table = buildCellTable();
    const ctx = initContext();

    expect(parser.canParse(table, ctx)).toBe(true);
    expect(parser.parse(table, ctx)).toEqual(
      expect.objectContaining({
        tables: [
          expect.objectContaining({
            headers: ['Название', 'Статус'],
          }),
        ],
      })
    );
    ctx.processedTables.add(table);
    expect(parser.canParse(table, ctx)).toBe(false);
  });
}

function registerOrphanSectionTitleTest() {
  it('creates a titled orphan section when no current section exists', () => {
    const ctx = initContext();
    const table = buildCellTable('Связанные записи');

    const result = parseGwtTableElement(table, ctx);

    expect(result.tables).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe('Связанные записи');
    expect(ctx.currentSection?.children).toEqual(result.tables ?? []);
  });
}

function registerProcessedEmptyTableTest() {
  it('marks empty tables processed even when no rows survive filtering', () => {
    const ctx = initContext();
    const table = document.createElement('table');
    table.className = 'cellTableWidget';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Название'].forEach((header) => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.append(th);
    });
    thead.append(headerRow);
    const tbody = document.createElement('tbody');
    const row = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = '';
    row.append(td);
    tbody.append(row);
    table.append(thead, tbody);
    document.body.append(table);

    expect(parseGwtTableElement(table, ctx)).toEqual({});
    expect(ctx.processedTables.has(table)).toBe(true);
  });
}

function registerDefaultSectionTitleFallbackTests() {
  it('keeps the default section title for untitled parents, title-less parents, and headerless tables', () => {
    const ctx = initContext();
    const wrapper = document.createElement('div');
    wrapper.className = 'GAQEVERFM';
    const emptyTitle = document.createElement('div');
    emptyTitle.className = 'GAQEVERAM';
    emptyTitle.textContent = '   ';
    const table = document.createElement('table');
    table.className = 'cellTableWidget';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Название'].forEach((header) => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.append(th);
    });
    thead.append(headerRow);
    const tbody = document.createElement('tbody');
    const row = document.createElement('tr');
    row.className = 'tableRow';
    const td = document.createElement('td');
    td.textContent = 'Alpha';
    row.append(td);
    tbody.append(row);
    table.append(thead, tbody);
    wrapper.append(emptyTitle, table);
    document.body.append(wrapper);

    parseGwtTableElement(table, ctx);
    expect(ctx.currentSection?.title).toBe('Список');

    const noTitleCtx = initContext();
    const noTitleWrapper = document.createElement('div');
    noTitleWrapper.className = 'GAQEVERFM';
    const noTitleTable = buildCellTable('Неиспользуемый заголовок');
    noTitleWrapper.append(noTitleTable);
    document.body.append(noTitleWrapper);

    parseGwtTableElement(noTitleTable, noTitleCtx);
    expect(noTitleCtx.currentSection?.title).toBe('Список');

    const headerlessTable = document.createElement('table');
    headerlessTable.className = 'cellTableWidget';
    headerlessTable.append(document.createElement('tbody'));
    document.body.append(headerlessTable);

    expect(parseGwtTableElement(headerlessTable, initContext())).toEqual({});
  });
}

function registerSkippedRowsEarlyReturnTest() {
  it('returns empty output when all parsed rows are skipped before non-empty filtering', () => {
    const ctx = initContext();
    const table = document.createElement('table');
    table.className = 'cellTableWidget';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = 'Название';
    headerRow.append(th);
    thead.append(headerRow);
    const tbody = document.createElement('tbody');
    const hiddenRow = document.createElement('tr');
    hiddenRow.className = 'tableRow';
    hiddenRow.style.display = 'none';
    const td = document.createElement('td');
    td.textContent = 'Скрытая запись';
    hiddenRow.append(td);
    tbody.append(hiddenRow);
    table.append(thead, tbody);
    document.body.append(table);

    expect(parseGwtTableElement(table, ctx)).toEqual({});
    expect(ctx.processedTables.has(table)).toBe(true);
    expect(ctx.currentSection?.children).toEqual([]);
  });
}

describe('gwt table parser', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerParserCanParseTest();
  registerOrphanSectionTitleTest();
  registerProcessedEmptyTableTest();
  registerDefaultSectionTitleFallbackTests();
  registerSkippedRowsEarlyReturnTest();
});
