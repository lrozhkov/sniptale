import { expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { convertTreeToMarkdown, estimateTokens } from './markdown';

function createMarkdownFixture(): ParsedDOMTree {
  return {
    context: 'Demo context',
    title: 'Demo page',
    structure: [
      {
        type: 'section',
        id: 'section-profile',
        title: 'Profile',
        children: [
          {
            type: 'field',
            id: 'field-link',
            label: 'Portal',
            value: 'Example|Site\nDocs',
            valueType: 'link',
            linkRef: 'https://example.com',
          },
          {
            type: 'field',
            id: 'field-paragraph',
            label: 'Текст',
            value: 'The Web was invented by Tim Berners-Lee at CERN.',
            valueType: 'string',
            contentRole: 'paragraph',
          },
          {
            type: 'field',
            id: 'field-list-item',
            label: 'Список 1',
            value: 'HTTP',
            valueType: 'string',
            contentRole: 'list-item',
          },
          {
            type: 'table',
            id: 'table-assets',
            headers: ['Status', 'Name', 'Screenshot'],
            rows: [
              {
                id: 'row-1',
                selected: false,
                data: {
                  Status: 'done',
                  Name: 'Workstation',
                  Screenshot: 'screen-1.png',
                },
                selector: '#row-1',
              },
            ],
          },
        ],
      },
    ],
  };
}

it('converts parsed trees to markdown and estimates tokens', () => {
  const markdown = convertTreeToMarkdown(createMarkdownFixture());

  expect(markdown).toContain('# Demo page');
  expect(markdown).toContain('*Demo context*');
  expect(markdown).toContain('[Example\\|Site<br>Docs](https://example.com)');
  expect(markdown).toContain('The Web was invented by Tim Berners-Lee at CERN.');
  expect(markdown).toContain('- HTTP');
  expect(markdown).toContain('| Status | Name | Screenshot |');
  expect(estimateTokens('abcd')).toBe(1);
  expect(estimateTokens('abcdef')).toBe(2);
});
