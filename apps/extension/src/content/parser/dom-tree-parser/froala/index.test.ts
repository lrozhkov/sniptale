// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const popupMocks = vi.hoisted(() => ({
  extractFullImageUrlsMock: vi.fn(),
}));

vi.mock('./popup', () => ({
  extractFullImageUrls: popupMocks.extractFullImageUrlsMock,
}));

import { collectFroalaImages } from '.';

function createCommentIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = 'iframe$1';
  iframe.src = `${window.location.origin}/comment`;
  const iframeDocument = document.implementation.createHTMLDocument('iframe');
  iframeDocument.body.innerHTML = `
    <img src="https://example.com/preview?uuid=file$11" />
    <img src="https://example.com/preview?uuid=file$22" />
  `;
  Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });
  document.body.append(iframe);
  return iframe;
}

function createIframe(args: { html: string; id: string; src: string }): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = args.id;
  iframe.src = args.src;
  const iframeDocument = document.implementation.createHTMLDocument('iframe');
  iframeDocument.body.innerHTML = args.html;
  Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });
  document.body.append(iframe);
  return iframe;
}

function createFetchMock() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    headers: { get: () => 'attachment; filename="image.png"' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function expectCommentFroalaImages(result: Awaited<ReturnType<typeof collectFroalaImages>>) {
  expect(result).toEqual([
    {
      uuid: '11',
      previewSrc: 'https://example.com/preview?uuid=file$11',
      fullUrl: 'https://example.com/download?uuid=file$11',
      downloadUuid: '11',
      source: {
        iframeId: 'iframe$1',
        iframeSrc: `${window.location.origin}/comment`,
        context: 'comment',
      },
    },
    {
      uuid: '22',
      previewSrc: 'https://example.com/preview?uuid=file$22',
      fullUrl: null,
      downloadUuid: null,
      source: {
        iframeId: 'iframe$1',
        iframeSrc: `${window.location.origin}/comment`,
        context: 'comment',
      },
    },
  ]);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  popupMocks.extractFullImageUrlsMock.mockReset();
});

it('collects Froala images through the popup seam and preserves iframe source context', async () => {
  createCommentIframe();
  createFetchMock();
  popupMocks.extractFullImageUrlsMock.mockResolvedValue([
    {
      uuid: '11',
      previewSrc: 'https://example.com/preview?uuid=file$11',
      fullUrl: 'https://example.com/download?uuid=file$11',
    },
    {
      uuid: '22',
      previewSrc: 'https://example.com/preview?uuid=file$22',
      fullUrl: null,
    },
  ]);

  expectCommentFroalaImages(await collectFroalaImages());

  expect(popupMocks.extractFullImageUrlsMock).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        uuid: '11',
        filename: 'image.png',
        element: expect.any(HTMLImageElement),
      }),
      expect.objectContaining({
        uuid: '22',
        filename: 'image.png',
        element: expect.any(HTMLImageElement),
      }),
    ],
    expect.any(Document)
  );
});

it('uses description context and filename fallback when HEAD metadata is unavailable', async () => {
  createIframe({
    id: 'iframe$service',
    src: `${window.location.origin}/serviceCall`,
    html: '<img src="https://example.com/preview?uuid=file$33&thumb=true" />',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, headers: { get: () => null } }))
  );
  popupMocks.extractFullImageUrlsMock.mockResolvedValue([
    {
      uuid: '33',
      previewSrc: 'https://example.com/preview?uuid=file$33&thumb=true',
      fullUrl: 'https://example.com/download?uuid=file$33',
    },
  ]);

  const result = await collectFroalaImages();

  expect(result).toEqual([
    expect.objectContaining({
      downloadUuid: '33',
      source: expect.objectContaining({ context: 'description' }),
    }),
  ]);
  expect(popupMocks.extractFullImageUrlsMock).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        filename: 'file_33',
        uuid: '33',
      }),
    ],
    expect.any(Document)
  );
});

it('uses source page URL for Froala iframe origin checks', async () => {
  window.history.replaceState({}, '', '/apps/extension/src/web-snapshot-viewer/index.html');
  createIframe({
    id: 'iframe$source',
    src: 'https://source.example/richText',
    html: '<img src="https://source.example/preview?uuid=file$44" />',
  });
  createFetchMock();
  popupMocks.extractFullImageUrlsMock.mockResolvedValue([
    {
      uuid: '44',
      previewSrc: 'https://source.example/preview?uuid=file$44',
      fullUrl: 'https://source.example/download?uuid=file$44',
    },
  ]);

  const result = await collectFroalaImages(undefined, document, 'https://source.example/page');

  expect(result).toEqual([
    expect.objectContaining({
      uuid: '44',
      downloadUuid: '44',
    }),
  ]);
  expect(popupMocks.extractFullImageUrlsMock).toHaveBeenCalled();
});

it('skips popup extraction when the iframe body has no exportable Froala images', async () => {
  createIframe({
    id: 'iframe$empty',
    src: `${window.location.origin}/richText?id=empty`,
    html: '<p>plain text only</p>',
  });

  await expect(collectFroalaImages()).resolves.toEqual([]);
  expect(popupMocks.extractFullImageUrlsMock).not.toHaveBeenCalled();
});
