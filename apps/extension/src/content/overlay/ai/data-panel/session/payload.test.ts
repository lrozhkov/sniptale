import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildSelectedDataPayload } from './payload';

const sampleTreeData = {
  context: 'Issue details',
  title: 'AI picker',
  structure: [
    {
      children: [
        {
          id: 'field-1',
          label: 'Status',
          selected: true,
          type: 'field',
          value: 'Open',
          valueType: 'string',
        },
        {
          headers: ['Name', 'Role'],
          id: 'table-1',
          rows: [
            {
              data: { Name: 'Alice', Role: 'Owner' },
              id: 'row-1',
              selected: true,
            },
          ],
          selected: true,
          type: 'table',
        },
      ],
      id: 'section-1',
      selected: true,
      title: 'Section',
      type: 'section',
    },
  ],
} as unknown as ParsedDOMTree;

describe('buildSelectedDataPayload', () => {
  it('projects selected tree data and excluded columns into AI json payload', () => {
    const selectedData = buildSelectedDataPayload(
      new Map([['table-1', ['Role']]]),
      sampleTreeData,
      new Map([
        ['section-1', { expanded: true, id: 'section-1', selected: true }],
        ['field-1', { expanded: true, id: 'field-1', selected: true }],
        ['table-1', { expanded: true, id: 'table-1', selected: true }],
        ['row-1', { expanded: true, id: 'row-1', selected: true }],
      ])
    );

    expect(JSON.parse(selectedData)).toEqual({
      f: [{ c: 'Open', id: 'field-1', n: 'Status', new: '' }],
      i: expect.stringContaining('Редактирование: AI picker.'),
      t: [
        {
          r: [
            {
              d: { Name: 'Alice' },
              id: 'row-1',
              new: { Name: '' },
            },
          ],
          ttl: 'Section',
        },
      ],
    });
  });
});
