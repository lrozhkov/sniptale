// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

const driverMocks = vi.hoisted(() => ({
  resolveFroalaPopupUrlFromImageMock: vi.fn(),
}));

vi.mock('./driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./driver')>()),
  resolveFroalaPopupUrlFromImage: driverMocks.resolveFroalaPopupUrlFromImageMock,
}));

import { extractFullImageUrls } from './popup';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  driverMocks.resolveFroalaPopupUrlFromImageMock.mockReset();
});

it('extracts full image urls through the DOM-driver seam and skips images without elements', async () => {
  vi.useFakeTimers();
  driverMocks.resolveFroalaPopupUrlFromImageMock
    .mockResolvedValueOnce('https://example.com/download?uuid=file$11')
    .mockResolvedValueOnce(null);

  const firstElement = document.createElement('img');
  firstElement.src = 'https://example.com/preview?uuid=file$11';
  const secondElement = document.createElement('img');
  secondElement.src = 'https://example.com/preview?uuid=file$22';

  const promise = extractFullImageUrls([
    { uuid: '11', src: firstElement.src, element: firstElement },
    { uuid: 'skip', src: 'https://example.com/preview?uuid=file$skip' },
    { uuid: '22', src: secondElement.src, element: secondElement },
  ]);

  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual([
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

  expect(driverMocks.resolveFroalaPopupUrlFromImageMock).toHaveBeenNthCalledWith(1, {
    fallbackUrl: 'https://example.com/download?uuid=file$11',
    imgElement: firstElement,
    onClickError: expect.any(Function),
  });
  expect(driverMocks.resolveFroalaPopupUrlFromImageMock).toHaveBeenNthCalledWith(2, {
    fallbackUrl: 'https://example.com/download?uuid=file$22',
    imgElement: secondElement,
    onClickError: expect.any(Function),
  });
});

it('normalizes direct download urls and preserves null fallback when uuid is missing', async () => {
  vi.useFakeTimers();
  driverMocks.resolveFroalaPopupUrlFromImageMock
    .mockResolvedValueOnce('https://example.com/download?uuid=file$77')
    .mockResolvedValueOnce(null);

  const directDownloadImage = document.createElement('img');
  directDownloadImage.src = 'https://example.com/download?uuid=file$77&thumb=true';
  const uuidlessImage = document.createElement('img');
  uuidlessImage.src = 'https://example.com/static/plain-image.png';

  const promise = extractFullImageUrls([
    { uuid: '77', src: directDownloadImage.src, element: directDownloadImage },
    { uuid: '', src: uuidlessImage.src, element: uuidlessImage },
  ]);

  await vi.runAllTimersAsync();
  await expect(promise).resolves.toEqual([
    {
      uuid: '77',
      previewSrc: 'https://example.com/download?uuid=file$77&thumb=true',
      fullUrl: 'https://example.com/download?uuid=file$77',
    },
    {
      uuid: '',
      previewSrc: 'https://example.com/static/plain-image.png',
      fullUrl: null,
    },
  ]);

  expect(driverMocks.resolveFroalaPopupUrlFromImageMock).toHaveBeenNthCalledWith(1, {
    fallbackUrl: 'https://example.com/download?uuid=file$77',
    imgElement: directDownloadImage,
    onClickError: expect.any(Function),
  });
  expect(driverMocks.resolveFroalaPopupUrlFromImageMock).toHaveBeenNthCalledWith(2, {
    fallbackUrl: null,
    imgElement: uuidlessImage,
    onClickError: expect.any(Function),
  });
});
