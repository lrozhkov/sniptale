// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { buildExportData } from './data';

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: 'VitestAgent/1.0' });
});

function createPopulatedTree(): ParsedDOMTree {
  return {
    context: 'Portal',
    title: 'Project 7',
    structure: [
      {
        type: 'section',
        id: 'section-1',
        title: 'Summary',
        children: [
          {
            type: 'field',
            id: 'field-1',
            label: 'Status',
            value: 'Open',
            valueType: 'status',
          },
          {
            type: 'table',
            id: 'table-1',
            headers: ['Name'],
            rows: [
              {
                id: 'row-1',
                selected: true,
                selector: '[data-row=\"1\"]',
                data: { Name: 'Attachment' },
              },
            ],
          },
        ],
      },
    ],
  };
}

it('builds export data directly from the root owner for minimal structured trees', () => {
  const tree: ParsedDOMTree = {
    context: 'Portal',
    title: 'Project 7',
    structure: [{ type: 'section', id: 'section-1', title: 'Empty', children: [] }],
  };

  expect(buildExportData(tree)).toMatchObject({
    meta: {
      title: 'Project 7',
      userAgent: 'VitestAgent/1.0',
    },
    sections: [{ title: 'Empty' }],
  });
});

it('attaches fields and tables when the parsed section carries populated content', () => {
  expect(buildExportData(createPopulatedTree()).sections).toEqual([
    {
      title: 'Summary',
      fields: [
        {
          label: 'Status',
          value: 'Open',
          type: 'status',
          contentRole: undefined,
          linkRef: undefined,
        },
      ],
      tables: [
        {
          title: 'Summary',
          headers: ['Name'],
          rows: [{ data: { Name: 'Attachment' }, attachments: [] }],
        },
      ],
    },
  ]);
});
