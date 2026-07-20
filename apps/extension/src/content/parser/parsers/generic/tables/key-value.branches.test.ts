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
      title: 'Table parser branches',
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
        title: 'Table parser branches',
        url: 'https://example.test/table-branches',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

function appendCellRow(
  table: HTMLTableElement,
  cells: Array<string | HTMLElement>,
  cellTag: 'td' | 'th' = 'td'
): void {
  const row = document.createElement('tr');
  cells.forEach((cellValue) => {
    const cell = document.createElement(cellTag);
    if (typeof cellValue === 'string') {
      cell.textContent = cellValue;
    } else {
      cell.append(cellValue);
    }
    row.append(cell);
  });
  table.append(row);
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerDataTableDetectionTests() {
  it('detects thead and first-row header tables while rejecting no-header tables', () => {
    const parser = new KeyValueTableParser();

    const theadTable = document.createElement('table');
    const thead = document.createElement('thead');
    const theadRow = document.createElement('tr');
    theadRow.append(document.createElement('th'), document.createElement('th'));
    thead.append(theadRow);
    theadTable.append(thead);
    appendCellRow(theadTable, ['Item', 'Open', 'Meta']);

    const firstRowHeaderTable = document.createElement('table');
    appendCellRow(firstRowHeaderTable, ['Name', 'Status', 'Meta'], 'th');
    appendCellRow(firstRowHeaderTable, ['Item 1', 'Open', 'Ready']);

    const noHeaderTable = document.createElement('table');
    appendCellRow(noHeaderTable, ['Item 1', 'Open', 'Ready']);

    expect(parser.canParse(theadTable, createContext())).toBe(true);
    expect(parser.canParse(firstRowHeaderTable, createContext())).toBe(true);
    expect(parser.canParse(noHeaderTable, createContext())).toBe(false);
  });
}

function registerKeyValueResidualTests() {
  it('skips malformed rows and falls back to cell text when link text is empty', () => {
    const parser = new KeyValueTableParser();
    const ctx = createContext();
    const table = document.createElement('table');

    appendCellRow(table, ['Status', 'Open']);
    appendCellRow(table, ['Owner', 'Team']);
    appendCellRow(table, ['Broken']);
    appendCellRow(table, ['', 'Ignored']);

    const row = document.createElement('tr');
    const labelCell = document.createElement('td');
    labelCell.textContent = 'Document';
    const valueCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = 'https://example.test/doc';
    valueCell.append(link, document.createTextNode('Fallback title'));
    row.append(labelCell, valueCell);
    table.append(row);

    const result = parser.parse(table, ctx);

    expect(result.fields).toHaveLength(3);
    expect(result.fields?.[2]).toMatchObject({
      label: 'Document',
      value: 'Fallback title',
      valueType: 'link',
    });
  });
}

function registerEmptyHeaderTableTests() {
  it('returns an empty result when the resolved header row has no usable headers', () => {
    const parser = new KeyValueTableParser();
    const ctx = createContext();
    const table = document.createElement('table');

    appendCellRow(table, ['', '', ''], 'th');
    appendCellRow(table, ['Item 1', 'Open', 'Ready']);

    expect(parser.parse(table, ctx)).toEqual({});
  });
}

describe('KeyValueTableParser branch coverage', () => {
  registerDataTableDetectionTests();
  registerKeyValueResidualTests();
  registerEmptyHeaderTableTests();
});
