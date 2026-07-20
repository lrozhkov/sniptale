// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { findAIChangeTargets } from './change-targets';

const mocks = vi.hoisted(() => ({
  fieldSearch: vi.fn(),
  tableSearch: vi.fn(),
}));

vi.mock('./field-search', () => ({
  findFieldElementById: mocks.fieldSearch,
}));

vi.mock('./table-row-search', () => ({
  findTableRowElementById: mocks.tableSearch,
}));

function buildTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Test page',
    structure: [],
  };
}

function buildChanges(): AIEditChange[] {
  return [
    { type: 'field', fieldId: 'field-1', fieldName: 'A', newValue: '1' },
    { type: 'field', fieldId: 'field-1', fieldName: 'A', newValue: '2' },
    { type: 'tableRow', rowId: 'row-1', columnEdits: { A: '3' } },
    { type: 'field', fieldId: 'missing', fieldName: 'M', newValue: '4' },
  ];
}

describe('change-targets', () => {
  it('deduplicates resolved elements and skips missing changes', () => {
    const field = document.createElement('div');
    const row = document.createElement('div');
    const fieldNode = { id: 'field-1' } as never;
    const rowNode = { id: 'row-1' } as never;

    mocks.fieldSearch.mockImplementation((id: string) =>
      id === 'field-1' ? { element: field, node: fieldNode } : null
    );
    mocks.tableSearch.mockImplementation((id: string) =>
      id === 'row-1' ? { element: row, node: rowNode } : null
    );

    expect(findAIChangeTargets(buildTree(), buildChanges())).toEqual([field, row]);
    expect(mocks.fieldSearch).toHaveBeenCalledTimes(3);
    expect(mocks.tableSearch).toHaveBeenCalledTimes(1);
  });
});
