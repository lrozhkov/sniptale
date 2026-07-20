import { describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { markSelectedInTree } from './marking';

function buildTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Test page',
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Общая информация',
        selected: false,
        children: [
          {
            type: 'field',
            id: 'field-1',
            label: 'Стоимость',
            selected: false,
            value: '123',
            valueType: 'link',
          },
          {
            type: 'table',
            id: 'table-1',
            headers: ['Автор'],
            selected: false,
            rows: [{ id: 'row-1', selected: false, selector: '#row-1', data: { Автор: 'A' } }],
          },
        ],
      },
    ],
  };
}

describe('ai-pick dom-apply marking', () => {
  it('marks parent sections and child rows from selected ids', () => {
    const tree = markSelectedInTree(buildTree(), new Set(['row-1']));

    expect(tree.sections?.[0]).toMatchObject({
      id: 'section-1',
      selected: true,
      children: [
        { id: 'field-1', selected: false },
        {
          id: 'table-1',
          selected: true,
          rows: [{ id: 'row-1', selected: true }],
        },
      ],
    });
    expect(tree.structure).toBe(tree.sections);
  });
});
