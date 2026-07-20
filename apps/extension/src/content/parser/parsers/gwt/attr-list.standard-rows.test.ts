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

function buildAttrListRow(labelText: string, valueBuilder: (cell: HTMLTableCellElement) => void) {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  const titleCell = document.createElement('td');
  titleCell.className = 'attrTitle';
  titleCell.textContent = labelText;
  const valueCell = document.createElement('td');
  valueCell.className = 'attrValue';
  valueBuilder(valueCell);
  row.append(titleCell, valueCell);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);
  return { table, valueCell };
}

function registerLinkAttributeTest() {
  it('parses standard link rows and preserves linkRef', () => {
    const { table, valueCell } = buildAttrListRow('Заявка:', (cell) => {
      const link = document.createElement('a');
      link.href = 'https://example.test/request/42';
      link.textContent = 'REQ-42';
      cell.append(link);
    });

    const fields = parseAttributes(table, createTraversalContext());

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Заявка',
        linkRef: 'https://example.test/request/42',
        value: 'REQ-42',
        valueType: 'link',
      }),
    ]);
    expect(valueCell.getAttribute('data-sniptale-id')).toBe(fields[0]?.id);
  });
}

function registerSpecificSelectorTest() {
  it('builds a table-scoped selector for standard attrList rows', () => {
    buildAttrListRow('Не то поле:', (cell) => {
      cell.textContent = 'ignore';
    });
    const { table } = buildAttrListRow('Заявка:', (cell) => {
      const link = document.createElement('a');
      link.href = 'https://example.test/request/42';
      link.textContent = 'REQ-42';
      cell.append(link);
    });

    const fields = parseAttributes(table, createTraversalContext());

    expect(fields[0]?.selector).toBe(
      'table.attrList:nth-of-type(2) tbody tr:nth-child(1) td.attrValue'
    );
  });
}

function registerDuplicateAndMirrorSkipTest() {
  it('skips rows with processed value cells or empty values', () => {
    const duplicate = buildAttrListRow('Статус:', (cell) => {
      cell.textContent = 'В работе';
    });
    const duplicateCtx = createTraversalContext();
    duplicateCtx.processedFieldElements.add(duplicate.valueCell);

    const empty = buildAttrListRow('Описание:', (cell) => {
      cell.textContent = '';
    });

    expect(parseAttributes(duplicate.table, duplicateCtx)).toEqual([]);
    expect(parseAttributes(empty.table, createTraversalContext())).toEqual([]);
  });
}

function registerMissingBodyAndMissingLabelTests() {
  it('returns no fields for attr lists without tbody or without a usable label', () => {
    const tableWithoutBody = document.createElement('table');
    tableWithoutBody.className = 'attrList';
    document.body.append(tableWithoutBody);

    const unlabeled = buildAttrListRow(':', (cell) => {
      cell.textContent = '123';
    });

    expect(parseAttributes(tableWithoutBody, createTraversalContext())).toEqual([]);
    expect(parseAttributes(unlabeled.table, createTraversalContext())).toEqual([]);
  });
}

describe('gwt attr list standard rows', () => {
  beforeEach(() => {
    setGetOriginalElementFn((node) => node);
  });

  afterEach(() => {
    document.body.replaceChildren();
    setGetOriginalElementFn(null);
  });

  registerLinkAttributeTest();
  registerSpecificSelectorTest();
  registerDuplicateAndMirrorSkipTest();
  registerMissingBodyAndMissingLabelTests();
});
