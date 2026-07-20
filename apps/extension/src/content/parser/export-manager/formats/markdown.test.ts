import { expect, it } from 'vitest';

import type { ExportData } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { generateMarkdown, updateExportDataWithFilenames } from './markdown';

function createOverviewSection(): ParsedDOMTree['structure'][number] {
  return {
    type: 'section',
    id: 'section-1',
    title: 'Overview',
    children: [
      {
        type: 'field',
        id: 'field-1',
        label: 'Attachment',
        value: '[file_abc123]',
        valueType: 'string',
      },
      {
        type: 'field',
        id: 'field-2',
        label: 'Reference',
        value: 'Ticket link',
        valueType: 'link',
        linkRef: 'https://example.test/ticket/42',
      },
      {
        type: 'table',
        id: 'table-1',
        headers: ['Name', 'Notes'],
        rows: [
          {
            id: 'row-1',
            selected: true,
            selector: '[data-row=\"1\"]',
            data: {
              Name: '[file_doc777]',
              Notes: 'first line\nsecond | line',
            },
          },
        ],
      },
    ],
  };
}

function createNarrativeSection(): ParsedDOMTree['structure'][number] {
  return {
    type: 'section',
    id: 'section-2',
    title: 'History',
    children: [
      {
        type: 'field',
        id: 'field-5',
        label: 'Текст',
        value: 'The Web was invented by Tim Berners-Lee at CERN.',
        valueType: 'string',
        contentRole: 'paragraph',
      },
      {
        type: 'field',
        id: 'field-6',
        label: 'Список 1',
        value: 'HTTP',
        valueType: 'string',
        contentRole: 'list-item',
      },
    ],
  };
}

function createParsedTree(): ParsedDOMTree {
  return {
    context: 'Support Portal',
    title: 'Incident 42',
    structure: [createOverviewSection(), createNarrativeSection()],
    meta: {
      profile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'ticket',
        pipelineId: 'generic-structured',
        confidence: 0.9,
        matchedSignals: [],
        preferredRoots: ['main'],
      },
      title: 'Incident 42',
      url: 'https://example.test/ticket/42',
      warnings: [],
    },
  };
}

function createExportData(): ExportData {
  return {
    meta: {
      url: 'https://example.test/ticket/42',
      title: 'Incident 42',
      date: '2026-03-22',
      userAgent: 'Vitest',
    },
    sections: [
      {
        title: 'Overview',
        fields: [
          {
            label: 'Attachment',
            value: 'See [file_abc123]',
            type: 'string',
          },
        ],
        tables: [
          {
            title: 'Files',
            headers: ['Name'],
            rows: [
              {
                data: {
                  Name: '[file_doc777]',
                },
                attachments: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

it('generates markdown with profile metadata, file placeholders, and escaped table content', () => {
  const markdown = generateMarkdown(
    createParsedTree(),
    new Map([
      ['file_abc123', 'screenshot.png'],
      ['file_doc777', 'report.pdf'],
    ])
  );

  expect(markdown).toContain('# Incident 42');
  expect(markdown).toContain('*Support Portal · generic/ticket*');
  expect(markdown).toContain('- **Attachment:** ![screenshot.png](files/screenshot.png)');
  expect(markdown).toContain('- **Reference:** [Ticket link](https://example.test/ticket/42)');
  expect(markdown).toContain('## History');
  expect(markdown).toContain('The Web was invented by Tim Berners-Lee at CERN.');
  expect(markdown).toContain('- HTTP');
  expect(markdown).toContain('| Name | Notes |');
  expect(markdown).toContain('| [report.pdf](files/report.pdf) | first line<br>second \\| line |');
});

it('falls back to context-only metadata and preserves unresolved placeholders', () => {
  const parsedTree = createParsedTree();
  const markdown = generateMarkdown(
    {
      ...parsedTree,
      meta: {
        ...parsedTree.meta!,
        profile: {
          ...parsedTree.meta!.profile,
          pageKind: '',
        },
      },
      structure: [
        {
          type: 'section',
          id: 'section-2',
          title: 'Files',
          children: [
            {
              type: 'field',
              id: 'field-3',
              label: 'Doc',
              value: '[file_doc777]',
              valueType: 'string',
            },
            {
              type: 'field',
              id: 'field-4',
              label: 'Missing',
              value: '[file_missing]',
              valueType: 'string',
            },
          ],
        },
      ],
    },
    new Map([['doc777', 'notes.txt']])
  );

  expect(markdown).toContain('*Support Portal*');
  expect(markdown).not.toContain('generic/');
  expect(markdown).toContain('- **Doc:** [notes.txt](files/notes.txt)');
  expect(markdown).toContain('- **Missing:** [file_missing]');
});

it('updates export data in place with resolved filenames for fields and table cells', () => {
  const data = createExportData();

  const updated = updateExportDataWithFilenames(
    data,
    new Map([
      ['file_abc123', 'screenshot.png'],
      ['file_doc777', 'report.pdf'],
    ])
  );

  expect(updated).toBe(data);
  const firstSection = updated?.sections[0];
  const firstField = firstSection?.fields?.[0];
  const firstTable = firstSection?.tables?.[0];
  const firstRow = firstTable?.rows[0];
  expect(firstField?.value).toBe('See [screenshot.png]');
  expect(firstRow?.data['Name']).toBe('[report.pdf]');
});

it('returns null export data without modification', () => {
  expect(updateExportDataWithFilenames(null, new Map())).toBeNull();
});
