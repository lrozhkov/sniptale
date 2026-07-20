// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const { pageOrigin } = vi.hoisted(() => ({
  pageOrigin: 'https://example.com',
}));

vi.mock('../diagnostics/dom-driver', async () => {
  const actual = await vi.importActual<typeof import('../diagnostics/dom-driver')>(
    '../diagnostics/dom-driver'
  );
  return {
    ...actual,
    dismissPreviewModal: vi.fn(async () => undefined),
    getCurrentExportPageUrl: vi.fn(() => `${pageOrigin}/current-page`),
    listPreviewTriggers: vi.fn(),
    resolvePreviewDownloadHref: vi.fn(),
  };
});

import * as domDriver from '../diagnostics/dom-driver';
import { collectDirectLinks } from '.';

const PAGE_ORIGIN = pageOrigin;

const DEFAULT_TREE: ParsedDOMTree = {
  context: 'generic',
  title: 'Test page',
  structure: [
    {
      type: 'section',
      id: 'attachments',
      title: 'Attachments',
      children: [
        {
          type: 'table',
          id: 'table-1',
          headers: ['Preview', 'Document'],
          rows: [],
        },
      ],
    },
  ],
};

const listPreviewTriggersMock = vi.mocked(domDriver.listPreviewTriggers);
const resolvePreviewDownloadHrefMock = vi.mocked(domDriver.resolvePreviewDownloadHref);
const dismissPreviewModalMock = vi.mocked(domDriver.dismissPreviewModal);

function appendDirectDownloadRow(options: {
  href: string;
  rowId?: string;
  label?: string;
  extraCellText?: string;
}) {
  const row = document.createElement('tr');
  row.className = 'tableRow';
  if (options.rowId) {
    row.setAttribute('data-sniptale-id', options.rowId);
  }

  const firstCell = document.createElement('td');
  firstCell.textContent = options.label ?? 'Preview';
  row.append(firstCell);

  const secondCell = document.createElement('td');
  if (options.extraCellText) {
    secondCell.append(options.extraCellText);
  }

  const link = document.createElement('a');
  link.href = options.href;
  link.textContent = 'Download';
  secondCell.append(link);
  row.append(secondCell);
  document.body.append(row);
  return link;
}

function createTreeWithHeaders(headers: string[]): ParsedDOMTree {
  const firstSection = DEFAULT_TREE.structure[0];
  if (!firstSection) {
    throw new Error('Expected default tree section');
  }
  return {
    ...DEFAULT_TREE,
    structure: [
      {
        ...firstSection,
        children: [
          {
            type: 'table',
            id: 'table-1',
            headers,
            rows: [],
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  listPreviewTriggersMock.mockReset();
  resolvePreviewDownloadHrefMock.mockReset();
  dismissPreviewModalMock.mockReset();
});

it('collects direct links with table metadata and sanitized fallback filenames', () => {
  appendDirectDownloadRow({
    href: `${PAGE_ORIGIN}/download`,
    rowId: 'row-42',
    label: '',
    extraCellText: 'Quarterly Report',
  });
  expect(collectDirectLinks(createTreeWithHeaders(['Preview', 'Attachment']))).toEqual([
    {
      url: `${PAGE_ORIGIN}/download`,
      filename: 'Quarterly_ReportDownload_1.bin',
      source: 'direct',
      rowId: 'row-42',
      columnName: 'Attachment',
      tableName: 'Attachments',
    },
  ]);
});

it('skips invalid, duplicate, and intermediary direct links', () => {
  appendDirectDownloadRow({
    href: 'javascript:void(0)',
    rowId: 'invalid-row',
    extraCellText: 'Bad Link',
  });
  appendDirectDownloadRow({
    href: `${PAGE_ORIGIN}/files/download-report.pdf`,
    rowId: 'row-1',
    extraCellText: 'Original',
  });
  appendDirectDownloadRow({
    href: `${PAGE_ORIGIN}/files/download-report.pdf`,
    rowId: 'row-2',
    extraCellText: 'Duplicate',
  });
  appendDirectDownloadRow({
    href: 'https://en.wikipedia.org/w/index.php?title=Special:DownloadAsPdf&page=Web&action=show-download-screen',
    rowId: 'row-3',
    extraCellText: 'Intermediary',
  });
  expect(collectDirectLinks(DEFAULT_TREE)).toEqual([
    {
      url: `${PAGE_ORIGIN}/files/download-report.pdf`,
      filename: 'download-report.pdf',
      source: 'direct',
      rowId: 'row-1',
      columnName: 'Document',
      tableName: 'Attachments',
    },
  ]);
});

it('omits table metadata when the link is outside a mapped row cell', () => {
  const looseLink = document.createElement('a');
  looseLink.href = `${PAGE_ORIGIN}/photo?id=1`;
  looseLink.textContent = 'Loose image';
  looseLink.setAttribute('download', '');
  document.body.append(looseLink);

  expect(collectDirectLinks(DEFAULT_TREE)).toEqual([
    {
      url: `${PAGE_ORIGIN}/photo?id=1`,
      filename: 'photo',
      source: 'direct',
      rowId: undefined,
      columnName: undefined,
      tableName: undefined,
    },
  ]);
});

it('uses the single matching table headers when row metadata is unavailable', () => {
  appendDirectDownloadRow({
    href: `${PAGE_ORIGIN}/download/no-row-id`,
    extraCellText: 'Single table fallback',
  });

  expect(collectDirectLinks(DEFAULT_TREE)).toEqual([
    expect.objectContaining({
      url: `${PAGE_ORIGIN}/download/no-row-id`,
      filename: 'no-row-id',
      source: 'direct',
      columnName: 'Document',
      tableName: 'Attachments',
    }),
  ]);
});
