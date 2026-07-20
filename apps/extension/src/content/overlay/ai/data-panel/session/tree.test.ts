import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildInitialTreeState } from './tree';

function createSampleTreeData(): ParsedDOMTree {
  return {
    context: 'Issue details',
    structure: [
      {
        children: [
          {
            id: 'field-1',
            label: 'Name',
            selected: false,
            selector: '[data-field="1"]',
            type: 'field',
            value: 'Alice',
            valueType: 'string',
          },
          {
            headers: ['Name', 'Role'],
            id: 'table-1',
            rows: [
              {
                data: { Name: 'Alice', Role: 'Owner' },
                id: 'row-1',
                selected: false,
                selector: '[data-row="1"]',
              },
              {
                data: { Name: 'Bob', Role: 'Reviewer' },
                id: 'row-2',
                selected: true,
                selector: '[data-row="2"]',
              },
            ],
            selected: false,
            type: 'table',
          },
        ],
        id: 'section-1',
        selected: true,
        title: 'Section',
        type: 'section',
      },
    ],
    title: 'AI picker',
  };
}

describe('buildInitialTreeState', () => {
  it('creates expanded node state for sections, fields, tables, and rows', () => {
    expect(buildInitialTreeState(createSampleTreeData())).toEqual(
      new Map([
        ['section-1', { expanded: true, id: 'section-1', selected: true }],
        ['field-1', { expanded: true, id: 'field-1', selected: false }],
        ['table-1', { expanded: true, id: 'table-1', selected: false }],
        ['row-1', { expanded: true, id: 'row-1', selected: false }],
        ['row-2', { expanded: true, id: 'row-2', selected: true }],
      ])
    );
  });
});
