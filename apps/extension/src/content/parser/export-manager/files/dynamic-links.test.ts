// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

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
import { collectDynamicLinks } from '.';

const PAGE_ORIGIN = pageOrigin;
const listPreviewTriggersMock = vi.mocked(domDriver.listPreviewTriggers);
const resolvePreviewDownloadHrefMock = vi.mocked(domDriver.resolvePreviewDownloadHref);
const dismissPreviewModalMock = vi.mocked(domDriver.dismissPreviewModal);

function appendPreviewElement(options: { alt?: string; title?: string; rowId?: string }) {
  const row = document.createElement('tr');
  row.className = 'tableRow';
  if (options.rowId) {
    row.setAttribute('data-sniptale-id', options.rowId);
  }

  const cell = document.createElement('td');
  const image = document.createElement('img');
  image.setAttribute('style', 'cursor: pointer');
  if (options.alt) {
    image.setAttribute('alt', options.alt);
  }
  if (options.title) {
    image.setAttribute('title', options.title);
  }

  cell.append(image);
  row.append(cell);
  document.body.append(row);
  return image;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  listPreviewTriggersMock.mockReset();
  resolvePreviewDownloadHrefMock.mockReset();
  dismissPreviewModalMock.mockReset();
});

it('collects dynamic preview downloads, deduplicates them, and tracks progress', async () => {
  const firstPreview = appendPreviewElement({ alt: 'Visible screenshot', rowId: 'row-a' });
  const duplicatePreview = appendPreviewElement({ title: 'Duplicate preview', rowId: 'row-b' });
  const finalPreview = appendPreviewElement({ rowId: 'row-c' });
  listPreviewTriggersMock.mockReturnValue([firstPreview, duplicatePreview, finalPreview]);
  resolvePreviewDownloadHrefMock
    .mockResolvedValueOnce(`${PAGE_ORIGIN}/download?uuid=file$77`)
    .mockResolvedValueOnce(`${PAGE_ORIGIN}/download?uuid=file$77`)
    .mockResolvedValueOnce(`${PAGE_ORIGIN}/gallery/final-image.png`);

  const progress = vi.fn();
  const result = await collectDynamicLinks(progress, () => false);

  expect(result).toEqual([
    {
      url: `${PAGE_ORIGIN}/download?uuid=file$77`,
      filename: 'file_77',
      source: 'dynamic',
      rowId: 'row-a',
      columnName: undefined,
    },
    {
      url: `${PAGE_ORIGIN}/gallery/final-image.png`,
      filename: 'final-image.png',
      source: 'dynamic',
      rowId: 'row-c',
      columnName: undefined,
    },
  ]);
  expect(progress.mock.calls).toEqual([
    [1, 3, 'Обработка превью 1 из 3...'],
    [2, 3, 'Обработка превью 2 из 3...'],
    [3, 3, 'Обработка превью 3 из 3...'],
  ]);
  expect(dismissPreviewModalMock).toHaveBeenCalledTimes(3);
});

it('returns an empty list when there are no preview elements or the flow is cancelled early', async () => {
  listPreviewTriggersMock.mockReturnValue([]);
  await expect(
    collectDynamicLinks(
      () => undefined,
      () => false
    )
  ).resolves.toEqual([]);

  listPreviewTriggersMock.mockReturnValue([
    appendPreviewElement({ alt: 'Cancelled preview', rowId: 'row-cancelled' }),
  ]);
  await expect(
    collectDynamicLinks(
      () => undefined,
      () => true
    )
  ).resolves.toEqual([]);
  expect(resolvePreviewDownloadHrefMock).not.toHaveBeenCalled();
});

it('handles missing downloads and preview processing errors without aborting the loop', async () => {
  const firstPreview = appendPreviewElement({ alt: 'Missing modal', rowId: 'row-1' });
  const secondPreview = appendPreviewElement({ alt: 'Broken preview', rowId: 'row-2' });
  listPreviewTriggersMock.mockReturnValue([firstPreview, secondPreview]);
  resolvePreviewDownloadHrefMock
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('preview exploded'));

  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const progress = vi.fn();
  const result = await collectDynamicLinks(progress, () => false);

  expect(result).toEqual([]);
  expect(progress).toHaveBeenCalledTimes(2);
  expect(dismissPreviewModalMock).toHaveBeenCalledTimes(2);
  expect(warnSpy).toHaveBeenCalledWith(
    '[ContentExportManager]',
    'Error processing preview',
    expect.any(Error)
  );
});
