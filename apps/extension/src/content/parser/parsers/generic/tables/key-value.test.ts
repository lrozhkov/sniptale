// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { KeyValueTableParser } from './key-value';

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
      title: 'Table parser',
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
        title: 'Table parser',
        url: 'https://example.test/table',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

function appendKeyValueRow(
  table: HTMLTableElement,
  label: string,
  value: string,
  href?: string
): void {
  const row = document.createElement('tr');
  const labelCell = document.createElement('td');
  labelCell.textContent = `${label}:`;
  const valueCell = document.createElement('td');

  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = value;
    valueCell.append(link);
  } else {
    valueCell.textContent = value;
  }

  row.append(labelCell, valueCell);
  table.append(row);
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerCanParseTests() {
  it('detects key-value and data tables while skipping processed and GWT tables', () => {
    const parser = new KeyValueTableParser();

    const keyValueTable = document.createElement('table');
    appendKeyValueRow(keyValueTable, 'Status', 'Open');

    const dataTable = document.createElement('table');
    const headerRow = document.createElement('tr');
    headerRow.append(document.createElement('th'), document.createElement('th'));
    dataTable.append(headerRow);
    const dataRow = document.createElement('tr');
    dataRow.append(document.createElement('td'), document.createElement('td'));
    dataTable.append(dataRow);

    const gwtTable = document.createElement('table');
    gwtTable.className = 'attrList';

    const processedCtx = createContext();
    processedCtx.processedTables.add(keyValueTable);

    expect(parser.canParse(keyValueTable, createContext())).toBe(true);
    expect(parser.canParse(dataTable, createContext())).toBe(true);
    expect(parser.canParse(gwtTable, createContext())).toBe(false);
    expect(parser.canParse(keyValueTable, processedCtx)).toBe(false);
  });
}

function registerCanParseResidualTests() {
  it('rejects attr-list-owned, cell-table-widget, and non-table surfaces', () => {
    const parser = new KeyValueTableParser();
    const attrListOwned = document.createElement('table');
    appendKeyValueRow(attrListOwned, 'Status', 'Open');
    const attrListCtx = createContext();
    attrListCtx.processedAttrLists.add(attrListOwned);

    const cellTableWidget = document.createElement('table');
    cellTableWidget.className = 'cellTableWidget';

    expect(parser.canParse(attrListOwned, attrListCtx)).toBe(false);
    expect(parser.canParse(cellTableWidget, createContext())).toBe(false);
    expect(parser.canParse(document.createElement('div'), createContext())).toBe(false);
  });
}

function registerKeyValueParseTest() {
  it('creates an orphan data section and parses key-value rows into fields', () => {
    const parser = new KeyValueTableParser();
    const ctx = createContext();
    const table = document.createElement('table');

    appendKeyValueRow(table, 'Status', 'Open');
    appendKeyValueRow(table, 'Owner', 'Operations', 'https://example.test/owner');
    appendKeyValueRow(table, 'Mirror', 'Mirror');

    const result = parser.parse(table, ctx);

    expect(result.fields).toHaveLength(2);
    expect(ctx.currentSection?.title).toBe('Данные');
    expect(ctx.currentSection?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Status',
          value: 'Open',
          valueType: 'string',
        }),
        expect.objectContaining({
          label: 'Owner',
          value: 'Operations',
          valueType: 'link',
          linkRef: 'https://example.test/owner',
        }),
      ])
    );
  });
}

function registerDataTableParseTest() {
  it('parses header-driven tables into table nodes when key-value mode does not apply', () => {
    const parser = new KeyValueTableParser();
    const ctx = createContext();
    const table = document.createElement('table');
    const headerRow = document.createElement('tr');
    const nameHeader = document.createElement('th');
    nameHeader.textContent = 'Name';
    const statusHeader = document.createElement('th');
    statusHeader.textContent = 'Status';
    headerRow.append(nameHeader, statusHeader);

    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = 'Item 1';
    const statusCell = document.createElement('td');
    statusCell.textContent = 'Open';
    const extraCell = document.createElement('td');
    extraCell.textContent = 'Extra';
    row.append(nameCell, statusCell, extraCell);

    table.append(headerRow, row);

    const result = parser.parse(table, ctx);

    expect(result.tables).toHaveLength(1);
    expect(result.tables?.[0]).toMatchObject({
      type: 'table',
      headers: ['Name', 'Status'],
      rows: [
        expect.objectContaining({
          data: {
            Name: 'Item 1',
            Status: 'Open',
          },
        }),
      ],
    });
  });
}

function registerTheadParseTest() {
  it('parses thead-driven data tables into an existing section', () => {
    const parser = new KeyValueTableParser();
    const ctx = createContext();
    const existingSection = createExistingSection();
    ctx.currentSection = existingSection;
    ctx.result.structure.push(existingSection);
    const table = createTheadDataTable();

    const result = parser.parse(table, ctx);

    expect(result.tables).toHaveLength(1);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe('Existing section');
    expect(ctx.currentSection?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'table',
          headers: ['Name', 'Status', 'Meta'],
        }),
      ])
    );
  });
}

function createExistingSection() {
  return {
    type: 'section' as const,
    id: 'section-existing',
    title: 'Existing section',
    children: [],
    selected: true,
  };
}

function createTableCell(tagName: 'td' | 'th', text: string): HTMLTableCellElement {
  const cell = document.createElement(tagName);
  cell.textContent = text;
  return cell;
}

function createTheadDataTable(): HTMLTableElement {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.append(
    createTableCell('th', 'Name'),
    createTableCell('th', 'Status'),
    createTableCell('th', 'Meta')
  );
  thead.append(headerRow);

  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  row.append(
    createTableCell('td', 'Item 1'),
    createTableCell('td', 'Open'),
    createTableCell('td', 'Extra')
  );
  tbody.append(row);
  table.append(thead, tbody);
  return table;
}

function registerNoOutputFallbackTests() {
  it('returns an empty result when key-value rows are hidden or collapse to empty data-table output', () => {
    const parser = new KeyValueTableParser();

    const hiddenKeyValueTable = document.createElement('table');
    const hiddenRow = document.createElement('tr');
    hiddenRow.style.display = 'none';
    const hiddenLabel = document.createElement('td');
    hiddenLabel.textContent = 'Status';
    const hiddenValue = document.createElement('td');
    hiddenValue.textContent = 'Open';
    hiddenRow.append(hiddenLabel, hiddenValue);
    hiddenKeyValueTable.append(hiddenRow);

    const dataTableWithoutRows = document.createElement('table');
    const headerRow = document.createElement('tr');
    const nameHeader = document.createElement('th');
    nameHeader.textContent = 'Name';
    const statusHeader = document.createElement('th');
    statusHeader.textContent = 'Status';
    const metaHeader = document.createElement('th');
    metaHeader.textContent = 'Meta';
    headerRow.append(nameHeader, statusHeader, metaHeader);
    dataTableWithoutRows.append(headerRow);

    const hiddenDataRow = document.createElement('tr');
    hiddenDataRow.style.display = 'none';
    hiddenDataRow.append(
      document.createElement('td'),
      document.createElement('td'),
      document.createElement('td')
    );
    dataTableWithoutRows.append(hiddenDataRow);

    expect(parser.parse(hiddenKeyValueTable, createContext())).toEqual({});
    expect(parser.parse(dataTableWithoutRows, createContext())).toEqual({});
  });
}

describe('KeyValueTableParser', () => {
  registerCanParseTests();
  registerCanParseResidualTests();
  registerKeyValueParseTest();
  registerDataTableParseTest();
  registerTheadParseTest();
  registerNoOutputFallbackTests();
});
