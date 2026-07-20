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
    getCurrentExportPageUrl: vi.fn(() => `${pageOrigin}/current-page`),
    listDirectDownloadLinks: vi.fn(() => Array.from(document.querySelectorAll('a'))),
  };
});

import { collectDirectLinks } from '.';

function appendDirectDownloadRow(options: { extraCellText: string; href: string; rowId: string }) {
  const row = document.createElement('tr');
  row.className = 'tableRow';
  row.setAttribute('data-sniptale-id', options.rowId);

  const previewCell = document.createElement('td');
  previewCell.textContent = 'Preview';
  const linkCell = document.createElement('td');
  linkCell.append(options.extraCellText);

  const link = document.createElement('a');
  link.href = options.href;
  link.textContent = 'Download';
  linkCell.append(link);
  row.append(previewCell, linkCell);
  document.body.append(row);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('prefers row-id table matching when multiple tables expose the same cell index', () => {
  appendDirectDownloadRow({
    href: `${pageOrigin}/download/report.csv`,
    rowId: 'matched-row',
    extraCellText: 'Matched row',
  });
  const tree: ParsedDOMTree = {
    context: 'generic',
    title: 'Test page',
    structure: [
      {
        type: 'section',
        id: 'unrelated',
        title: 'Unrelated',
        children: [
          {
            type: 'table',
            id: 'table-other',
            headers: ['Preview', 'Other file'],
            rows: [{ id: 'other-row', selected: true, selector: '#other-row', data: {} }],
          },
        ],
      },
      {
        type: 'section',
        id: 'attachments',
        title: 'Attachments',
        children: [
          {
            type: 'table',
            id: 'table-attachments',
            headers: ['Preview', 'Attachment'],
            rows: [{ id: 'matched-row', selected: true, selector: '#matched-row', data: {} }],
          },
        ],
      },
    ],
  };

  expect(collectDirectLinks(tree)).toEqual([
    expect.objectContaining({
      columnName: 'Attachment',
      rowId: 'matched-row',
      tableName: 'Attachments',
    }),
  ]);
});
