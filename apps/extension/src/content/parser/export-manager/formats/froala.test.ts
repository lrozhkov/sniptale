// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import type { FroalaImageResource } from '../../dom-tree-parser/froala';

const { collectFroalaImagesMock } = vi.hoisted(() => ({
  collectFroalaImagesMock:
    vi.fn<
      (
        onProgress?: (current: number, total: number, message: string) => void,
        targetDocument?: Document,
        pageUrl?: string
      ) => Promise<FroalaImageResource[]>
    >(),
}));

vi.mock('../../dom-tree-parser/froala', (_importOriginal) => ({
  collectFroalaImages: collectFroalaImagesMock,
}));

import { collectFroalaImageResources } from './froala';

function createImage(options: {
  uuid: string;
  previewSrc: string;
  fullUrl?: string | null;
  downloadUuid?: string | null;
  context?: string;
}): FroalaImageResource {
  return {
    uuid: options.uuid,
    previewSrc: options.previewSrc,
    fullUrl: options.fullUrl ?? null,
    downloadUuid: options.downloadUuid ?? null,
    source: {
      iframeId: `${options.uuid}-iframe`,
      iframeSrc: `https://example.com/${options.context ?? 'unknown'}`,
      context: options.context ?? 'unknown',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  collectFroalaImagesMock.mockReset();
});

function createMixedFroalaImages(): FroalaImageResource[] {
  return [
    createImage({
      uuid: 'preview-a',
      previewSrc: 'https://example.com/previews/a.jpg',
      fullUrl: 'https://example.com/download?uuid=file$55',
      downloadUuid: '55',
      context: 'description',
    }),
    createImage({
      uuid: 'preview-b',
      previewSrc: 'https://example.com/previews/duplicate.jpg',
      fullUrl: 'https://example.com/download?uuid=file$55',
      downloadUuid: '55',
      context: 'comment',
    }),
    createImage({
      uuid: 'preview-c',
      previewSrc: 'https://example.com/previews/comment-image.png',
      context: 'comment',
    }),
    createImage({
      uuid: 'preview-d',
      previewSrc: 'https://example.com/download',
      downloadUuid: '88',
      context: '',
    }),
    createImage({
      uuid: 'preview-e',
      previewSrc: '',
      fullUrl: null,
      context: 'description',
    }),
  ];
}

function expectMixedFroalaResult(result: Awaited<ReturnType<typeof collectFroalaImageResources>>) {
  expect(result.resources).toEqual([
    {
      url: 'https://example.com/download?uuid=file$55',
      filename: 'file_55',
      source: 'dynamic',
      rowId: undefined,
      columnName: undefined,
      tableName: 'description',
    },
    {
      url: 'https://example.com/previews/comment-image.png',
      filename: 'comment-image.png',
      source: 'dynamic',
      rowId: undefined,
      columnName: undefined,
      tableName: 'comment',
    },
    {
      url: 'https://example.com/download',
      filename: 'froala_88_3.bin',
      source: 'dynamic',
      rowId: undefined,
      columnName: undefined,
      tableName: '',
    },
  ]);
  expect([...result.previewToDownloadMap.entries()]).toEqual([
    ['preview-a', '55'],
    ['preview-b', '55'],
    ['preview-d', '88'],
  ]);
}

it('builds file resources, deduplicates urls, and tracks preview-to-download mappings', async () => {
  collectFroalaImagesMock.mockResolvedValue(createMixedFroalaImages());

  const progress = vi.fn();
  const result = await collectFroalaImageResources(progress);

  expect(collectFroalaImagesMock).toHaveBeenCalledWith(progress, undefined, undefined);
  expectMixedFroalaResult(result);
});

it('passes source document and URL to Froala image collection', async () => {
  collectFroalaImagesMock.mockResolvedValue([]);
  const source = {
    document: document.implementation.createHTMLDocument('Snapshot'),
    pageUrl: 'https://snapshot.example/portal/',
  };

  await collectFroalaImageResources(vi.fn(), source);

  expect(collectFroalaImagesMock).toHaveBeenCalledWith(
    expect.any(Function),
    source.document,
    source.pageUrl
  );
});

it('falls back to preview uuid when the download uuid is missing', async () => {
  collectFroalaImagesMock.mockResolvedValue([
    createImage({
      uuid: 'preview-z',
      previewSrc: 'https://example.com/download',
      context: '',
    }),
  ]);

  const result = await collectFroalaImageResources(() => undefined);

  expect(result.resources).toEqual([
    {
      url: 'https://example.com/download',
      filename: 'froala_preview-z_1.bin',
      source: 'dynamic',
      rowId: undefined,
      columnName: undefined,
      tableName: '',
    },
  ]);
  expect(result.previewToDownloadMap.size).toBe(0);
});

it('returns empty collections and logs when froala extraction fails', async () => {
  const error = new Error('froala failed');
  collectFroalaImagesMock.mockRejectedValue(error);

  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const result = await collectFroalaImageResources(() => undefined);

  expect(result).toEqual({
    resources: [],
    previewToDownloadMap: new Map(),
  });
  expect(errorSpy).toHaveBeenCalledWith(
    '[ContentExportManager]',
    'Error collecting Froala images',
    expect.objectContaining({ message: error.message })
  );
});

it('keeps preview resources without table names and skips duplicate preview urls', async () => {
  const plainImage = createImage({
    uuid: 'preview-plain',
    previewSrc: 'https://example.com/previews/plain.png',
  });
  const duplicateImage = createImage({
    uuid: 'preview-duplicate',
    previewSrc: 'https://example.com/previews/plain.png',
  });
  Reflect.deleteProperty(plainImage.source, 'context');
  Reflect.deleteProperty(duplicateImage.source, 'context');
  collectFroalaImagesMock.mockResolvedValue([plainImage, duplicateImage]);

  const result = await collectFroalaImageResources(() => undefined);

  expect(result.resources).toEqual([
    {
      url: 'https://example.com/previews/plain.png',
      filename: 'plain.png',
      source: 'dynamic',
      rowId: undefined,
      columnName: undefined,
    },
  ]);
  expect(result.previewToDownloadMap.size).toBe(0);
});
