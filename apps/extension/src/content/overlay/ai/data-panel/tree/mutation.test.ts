import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildInitialTreeState } from '../session/tree';
import { toggleSelectedNodes } from './mutation';

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

describe('toggleSelectedNodes', () => {
  it('propagates section selection to descendant fields, tables, and rows', () => {
    const sampleTreeData = createSampleTreeData();
    const next = buildInitialTreeState(sampleTreeData);

    toggleSelectedNodes(next, sampleTreeData, 'section-1', true);

    expect(next.get('field-1')?.selected).toBe(true);
    expect(next.get('table-1')?.selected).toBe(true);
    expect(next.get('row-1')?.selected).toBe(true);
    expect(next.get('row-2')?.selected).toBe(true);
  });

  it('propagates table selection only to its rows', () => {
    const sampleTreeData = createSampleTreeData();
    const next = buildInitialTreeState(sampleTreeData);

    toggleSelectedNodes(next, sampleTreeData, 'table-1', true);

    expect(next.get('section-1')?.selected).toBe(true);
    expect(next.get('field-1')?.selected).toBe(false);
    expect(next.get('row-1')?.selected).toBe(true);
    expect(next.get('row-2')?.selected).toBe(true);
  });

  it('clears table and section selection when the last selected row is removed', () => {
    const sampleTreeData = createSampleTreeData();
    const next = buildInitialTreeState(sampleTreeData);

    next.set('section-1', { expanded: true, id: 'section-1', selected: true });
    next.set('table-1', { expanded: true, id: 'table-1', selected: true });
    next.set('row-2', { expanded: true, id: 'row-2', selected: false });

    toggleSelectedNodes(next, sampleTreeData, 'row-2', false);

    expect(next.get('table-1')?.selected).toBe(false);
    expect(next.get('section-1')?.selected).toBe(false);
  });
});
