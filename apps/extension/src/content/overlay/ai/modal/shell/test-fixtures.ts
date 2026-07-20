import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

export const integrationTreeData = {
  context: 'Issue details',
  title: 'AI picker',
  structure: [
    {
      id: 'section-1',
      selected: true,
      title: 'Section',
      type: 'section',
      children: [
        {
          id: 'field-1',
          label: 'Status',
          selected: true,
          type: 'field',
          value: 'Open and still waiting for a lengthy review',
          valueType: 'string',
        },
        {
          headers: ['Assignee', 'Long summary'],
          id: 'table-1',
          selected: true,
          type: 'table',
          rows: [
            {
              data: {
                Assignee: 'Alice Example',
                'Long summary':
                  'Needs a careful investigation because the regression only appears in the live modal flow.',
              },
              id: 'row-1',
              selected: true,
              selector: '[data-row="1"]',
            },
            {
              data: {
                Assignee: 'Bob Example',
                'Long summary':
                  'Escalated after the first patch because the footer counter still ignored the updated table payload.',
              },
              id: 'row-2',
              selected: true,
              selector: '[data-row="2"]',
            },
          ],
        },
      ],
    },
  ],
} as unknown as ParsedDOMTree;
