import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
}));

vi.mock('../../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.blobToDataUrlMock,
}));

import { resolveBrowserFrameFaviconDataUrl } from './favicon';

const FAVICON_MAX_BYTES = 256 * 1024;

function createChunkStream(
  chunks: Uint8Array[],
  onCancel: () => void = () => undefined
): ReadableStream<Uint8Array> {
  let nextChunkIndex = 0;

  return new ReadableStream({
    pull(controller) {
      const chunk = chunks[nextChunkIndex];
      nextChunkIndex += 1;
      if (chunk) {
        controller.enqueue(chunk);
        return;
      }

      controller.close();
    },
    cancel: onCancel,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('returns null for an empty favicon source and preserves valid raster data urls', async () => {
  await expect(resolveBrowserFrameFaviconDataUrl(null)).resolves.toBeNull();
  await expect(resolveBrowserFrameFaviconDataUrl(undefined)).resolves.toBeNull();
  await expect(resolveBrowserFrameFaviconDataUrl('data:image/png;base64,favicon')).resolves.toBe(
    'data:image/png;base64,favicon'
  );
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('rejects scriptable or malformed favicon data urls', async () => {
  await expect(
    resolveBrowserFrameFaviconDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')
  ).resolves.toBeNull();
  await expect(
    resolveBrowserFrameFaviconDataUrl('data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=')
  ).resolves.toBeNull();
  await expect(
    resolveBrowserFrameFaviconDataUrl('data:image/png;base64,not valid!')
  ).resolves.toBeNull();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('rejects oversized raster favicon data urls before fetch or conversion', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const oversizedPayload = 'A'.repeat(Math.ceil(((256 * 1024 + 1) * 4) / 3));

  await expect(
    resolveBrowserFrameFaviconDataUrl(`data:image/png;base64,${oversizedPayload}`)
  ).resolves.toBeNull();

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('rejects non-web and malformed remote favicon URLs before fetch', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  await expect(
    resolveBrowserFrameFaviconDataUrl('http://example.com/favicon.png')
  ).resolves.toBeNull();
  await expect(
    resolveBrowserFrameFaviconDataUrl('blob:https://example.com/favicon')
  ).resolves.toBeNull();
  await expect(
    resolveBrowserFrameFaviconDataUrl('chrome-extension://extension-id/favicon.png')
  ).resolves.toBeNull();
  await expect(resolveBrowserFrameFaviconDataUrl('file:///tmp/favicon.png')).resolves.toBeNull();
  await expect(resolveBrowserFrameFaviconDataUrl('not a url')).resolves.toBeNull();

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('rejects private-network remote favicon URLs before fetch', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const urls = [
    'https://127.0.0.1/favicon.png',
    'https://printer.local/favicon.png',
    'https://localhost./favicon.png',
    'https://printer.local./favicon.png',
    'https://foo.localhost./favicon.png',
    'https://[fc00::1]/favicon.png',
    'https://[fe90::1]/favicon.png',
    'https://[febf::1]/favicon.png',
    'https://[::ffff:127.0.0.1]/favicon.png',
  ];

  for (const url of urls) {
    await expect(resolveBrowserFrameFaviconDataUrl(url)).resolves.toBeNull();
  }

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('fetches remote favicons and converts them to data urls', async () => {
  mocks.blobToDataUrlMock.mockResolvedValue('data:image/png;base64,converted');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('favicon', { headers: { 'content-type': 'image/png' } }))
  );

  await expect(resolveBrowserFrameFaviconDataUrl('https://example.com/favicon.ico')).resolves.toBe(
    'data:image/png;base64,converted'
  );
  expect(fetch).toHaveBeenCalledWith('https://example.com/favicon.ico', {
    credentials: 'omit',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  const convertedBlob = mocks.blobToDataUrlMock.mock.calls[0]?.[0] as Blob;
  expect(convertedBlob.type).toBe('image/png');
  await expect(convertedBlob.text()).resolves.toBe('favicon');
});

it('rejects redirected remote favicon responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { location: 'https://cdn.example.com/favicon.png' },
        status: 302,
      })
    )
  );

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/favicon.ico')
  ).resolves.toBeNull();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('aborts remote favicon fetches on timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    })
  );

  const resultPromise = resolveBrowserFrameFaviconDataUrl('https://example.com/favicon.ico');
  await vi.advanceTimersByTimeAsync(15_000);

  await expect(resultPromise).resolves.toBeNull();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('cancels oversized streamed favicons before conversion', async () => {
  const cancelSpy = vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(createChunkStream([new Uint8Array(FAVICON_MAX_BYTES + 1)]), {
        headers: { 'content-type': 'image/png' },
      })
    )
  );

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/favicon.ico')
  ).resolves.toBeNull();
  expect(cancelSpy).toHaveBeenCalled();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('rejects oversized or scriptable fetched favicons before conversion', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          'content-length': String(FAVICON_MAX_BYTES + 1),
          'content-type': 'image/png',
        },
      })
    )
  );

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/oversized-favicon.png')
  ).resolves.toBeNull();

  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response('<svg />', { headers: { 'content-type': 'image/svg+xml' } }))
  );

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/favicon.svg')
  ).resolves.toBeNull();
  expect(mocks.blobToDataUrlMock).not.toHaveBeenCalled();
});

it('drops fetched favicons when conversion does not produce a valid raster data url', async () => {
  mocks.blobToDataUrlMock.mockResolvedValue('data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('favicon', { headers: { 'content-type': 'image/png' } }))
  );

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/favicon.png')
  ).resolves.toBeNull();
});

it('returns null when favicon fetch fails or the response is not ok', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/bad-favicon.ico')
  ).resolves.toBeNull();

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

  await expect(
    resolveBrowserFrameFaviconDataUrl('https://example.com/offline-favicon.ico')
  ).resolves.toBeNull();
});
