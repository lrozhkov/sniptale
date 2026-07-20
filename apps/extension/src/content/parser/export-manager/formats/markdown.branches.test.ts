import { describe, expect, it } from 'vitest';
import type { ExportData } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { generateMarkdown, updateExportDataWithFilenames } from './markdown';

function createBlockAwareSections(): ParsedDOMTree['structure'] {
  return [
    {
      type: 'section',
      id: 'section-narrative',
      title: 'Narrative',
      kind: 'narrative',
      children: [
        {
          type: 'table',
          id: 'table-attachments',
          headers: ['Name'],
          rows: [
            {
              id: 'row-1',
              selected: true,
              selector: '[data-row="1"]',
              data: { Name: '[file_doc777]' },
            },
          ],
        },
      ],
    },
    {
      type: 'section',
      id: 'section-plain',
      title: 'Plain fields',
      children: [
        {
          type: 'field',
          id: 'field-empty',
          label: 'Empty value',
          value: '',
          valueType: 'string',
        },
      ],
    },
  ];
}

function createNarrativeBlocks(): NonNullable<ParsedDOMTree['blocks']> {
  return [
    {
      id: 'block-heading',
      sectionId: 'section-narrative',
      kind: 'heading',
      text: 'Narrative',
    },
    {
      id: 'block-attachment',
      sectionId: 'section-narrative',
      kind: 'attachment',
      text: '[file_preview123]',
    },
    {
      id: 'block-table',
      sectionId: 'section-narrative',
      kind: 'data-table',
      tableRef: 'table-attachments',
    },
  ];
}

function createBlockAwareTree(): ParsedDOMTree {
  return {
    context: 'Docs',
    title: 'Block aware page',
    structure: createBlockAwareSections(),
    blocks: createNarrativeBlocks(),
  };
}

function createExportData(): ExportData {
  return {
    meta: {
      date: '2026-03-31',
      title: 'Export',
      url: 'https://example.test/export',
      userAgent: 'Vitest',
    },
    sections: [
      {
        title: 'Overview',
        fields: [
          {
            label: 'Attachment',
            type: 'string',
            value: 'See [file_preview123]',
          },
        ],
        tables: [
          {
            title: 'Files',
            headers: ['Name'],
            rows: [
              {
                attachments: [],
                data: {
                  Name: '[file_missing]',
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('export-manager markdown branches', () => {
  it('renders block-aware sections with heading skipping and mixed image/file placeholders', () => {
    const markdown = generateMarkdown(
      createBlockAwareTree(),
      new Map([
        ['preview123', 'preview-image.png'],
        ['file_doc777', 'manual.pdf'],
      ])
    );

    expect(markdown).toContain('# Block aware page');
    expect(markdown.match(/## Narrative/g)).toHaveLength(1);
    expect(markdown).toContain('- ![preview-image.png](files/preview-image.png)');
    expect(markdown).toContain('| [manual.pdf](files/manual.pdf) |');
    expect(markdown).toContain('- **Empty value:** ');
  });

  it('updates export data with bare-uuid fallback filenames while preserving unresolved placeholders', () => {
    const data = createExportData();

    const updated = updateExportDataWithFilenames(
      data,
      new Map([['preview123', 'preview-image.png']])
    );
    const firstSection = updated?.sections[0];
    const firstField = firstSection?.fields?.[0];
    const firstTable = firstSection?.tables?.[0];
    const firstRow = firstTable?.rows[0];

    expect(firstField?.value).toBe('See [preview-image.png]');
    expect(firstRow?.data['Name']).toBe('[file_missing]');
  });
});
