// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { getMoscowFilenameTimestamp } from '@sniptale/foundation/utils/export-timestamp';
import { buildExportData, createExportStats, getMoscowTimestamp, sanitizeFilename } from './data';

function withMockedDate(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

function createParsedTree(): ParsedDOMTree {
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
      {
        type: 'section',
        id: 'section-2',
        title: 'Empty',
        children: [],
      },
    ],
  };
}

function createNarrativeBlocksTree(): ParsedDOMTree {
  return {
    context: 'Docs',
    title: 'Narrative page',
    structure: [
      {
        type: 'section',
        id: 'section-narrative',
        title: 'Overview',
        kind: 'narrative',
        children: [],
      },
    ],
    blocks: [
      {
        id: 'block-heading',
        sectionId: 'section-narrative',
        kind: 'heading',
        text: 'Overview',
      },
      {
        id: 'block-paragraph',
        sectionId: 'section-narrative',
        kind: 'paragraph',
        text: 'Canonical narrative paragraphs should not degrade into Текст 1.',
      },
      {
        id: 'block-list',
        sectionId: 'section-narrative',
        kind: 'list',
        items: ['First bullet', 'Second bullet'],
      },
    ],
  };
}

function createTreeWithCanonicalMeta(): ParsedDOMTree {
  return {
    ...createParsedTree(),
    meta: {
      profile: {
        vendor: 'generic',
        appFamily: 'generic-web',
        pageKind: 'content',
        pipelineId: 'generic-structured',
        confidence: 0.8,
        matchedSignals: [],
        preferredRoots: ['body'],
      },
      title: 'Canonical Export Title',
      url: 'https://example.test/canonical-export',
      warnings: [],
    },
  };
}

function expectNarrativeExport(data: ReturnType<typeof buildExportData>): void {
  expect(data.sections).toEqual([
    {
      title: 'Overview',
      fields: [
        {
          label: 'Абзац',
          value: 'Canonical narrative paragraphs should not degrade into Текст 1.',
          type: 'string',
          contentRole: 'paragraph',
          linkRef: undefined,
        },
        {
          label: 'Элемент списка',
          value: 'First bullet',
          type: 'string',
          contentRole: 'list-item',
          linkRef: undefined,
        },
        {
          label: 'Элемент списка',
          value: 'Second bullet',
          type: 'string',
          contentRole: 'list-item',
          linkRef: undefined,
        },
      ],
    },
  ]);
}

beforeEach(() => {
  document.title = 'Export Title';
  window.history.replaceState({}, '', '/export/7');
  vi.stubGlobal('navigator', {
    userAgent: 'VitestAgent/1.0',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('builds export data with document metadata, fields, and tables', () => {
  withMockedDate('2026-03-22T10:11:12.000Z');

  const data = buildExportData(createTreeWithCanonicalMeta());

  expect(data.meta).toEqual({
    url: 'https://example.test/canonical-export',
    title: 'Canonical Export Title',
    date: getMoscowTimestamp(),
    userAgent: 'VitestAgent/1.0',
  });
  expect(data.sections).toEqual([
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
          rows: [
            {
              data: { Name: 'Attachment' },
              attachments: [],
            },
          ],
        },
      ],
    },
    {
      title: 'Empty',
    },
  ]);
});

it('uses canonical narrative blocks to build cleaner export fields', () => {
  expectNarrativeExport(buildExportData(createNarrativeBlocksTree()));
});

it('creates export stats for populated and empty export payloads', () => {
  const populatedStats = createExportStats(
    {
      meta: {
        url: 'https://example.test',
        title: 'Export',
        date: '2026-03-22',
        userAgent: 'VitestAgent/1.0',
      },
      sections: [
        {
          title: 'Section',
          tables: [
            {
              title: 'Files',
              headers: ['Name'],
              rows: [
                { data: { Name: 'A' }, attachments: [] },
                { data: { Name: 'B' }, attachments: [] },
              ],
            },
          ],
        },
      ],
    },
    5,
    1
  );

  expect(populatedStats).toEqual({
    sectionsCount: 1,
    rowsCount: 2,
    filesCount: 5,
    filesFailed: 1,
  });
  expect(createExportStats(null, 0, 0)).toEqual({
    sectionsCount: 0,
    rowsCount: 0,
    filesCount: 0,
    filesFailed: 0,
  });
});

it('formats timestamps in Moscow time and sanitizes filenames', () => {
  withMockedDate('2026-03-22T10:11:12.000Z');

  expect(getMoscowTimestamp()).toBe('2026-03-22_13-11-12');
  expect(getMoscowTimestamp()).toBe(getMoscowFilenameTimestamp());
  expect(sanitizeFilename('  bad:/name*with   spaces?.zip  ')).toBe('badnamewith_spaces.zip');
  expect(sanitizeFilename('x'.repeat(80), 10)).toBe('xxxxxxxxxx');
});
