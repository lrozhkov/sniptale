import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  authorizeWebSnapshotCaptureRequest,
  cancelWebSnapshotCaptureRequest,
  registerWebSnapshotAssetSession,
  resetWebSnapshotAssetSessionsForTests,
} from './session';
import { fetchWebSnapshotAssetForSession, fetchWebSnapshotAssetsForSession } from './fetch';

const TEN_MIB = 10 * 1024 * 1024;

function createResponse(args: {
  body?: string;
  bodyStream?: ReadableStream<Uint8Array> | null;
  contentLength?: string;
  contentType?: string;
  ok?: boolean;
  status?: number;
  url?: string;
}): Response {
  const body =
    args.bodyStream === undefined ? createBodyStream([args.body ?? 'asset']) : args.bodyStream;
  const response = new Response(body, {
    headers: {
      ...(args.contentType ? { 'content-type': args.contentType } : {}),
      ...(args.contentLength ? { 'content-length': args.contentLength } : {}),
    },
    status: args.ok === false ? (args.status ?? 500) : (args.status ?? 200),
  });
  if (args.url) Object.defineProperty(response, 'url', { value: args.url });
  vi.spyOn(response, 'blob');
  return response;
}

function createBodyStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

function registerSession(
  urls: string[] = ['https://cdn.example.com/image.png'],
  allowExternalAssetRedirects = false
): string {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', {
    allowAnonymousCrossOriginAssets: true,
    allowExternalAssetRedirects,
  });
  return registerWebSnapshotAssetSession(42, 'req-1', urls);
}

beforeEach(() => {
  resetWebSnapshotAssetSessionsForTests();
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'snapshot-session-1'),
  });
  vi.stubGlobal('btoa', (binary: string) => Buffer.from(binary, 'binary').toString('base64'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => createResponse({ contentType: 'image/png' }))
  );
});

afterEach(() => {
  vi.useRealTimers();
  resetWebSnapshotAssetSessionsForTests();
  vi.unstubAllGlobals();
});

it('bounds a hostile asset batch by concurrency and the session time budget', async () => {
  vi.useFakeTimers();
  const urls = Array.from(
    { length: 12 },
    (_, index) => `https://cdn.example.com/hanging-${index}.png`
  );
  const sessionId = registerSession(urls);
  let active = 0;
  let maxActive = 0;
  vi.mocked(fetch).mockImplementation((_input, init) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          active -= 1;
          reject(init.signal?.reason);
        },
        { once: true }
      );
    });
  });

  const batch = fetchWebSnapshotAssetsForSession({ sessionId, tabId: 42, urls });
  for (let wave = 0; wave < 4; wave += 1) {
    await vi.advanceTimersByTimeAsync(15_001);
  }

  const results = await batch;
  expect(results).toHaveLength(urls.length);
  expect(results.every((result) => result.success === false)).toBe(true);
  expect(maxActive).toBe(3);
  expect(active).toBe(0);
});

it('retains per-item failure results when a batch fetch rejects with a non-Error value', async () => {
  const urls = ['https://cdn.example.com/ok.png', 'https://cdn.example.com/rejected.png'];
  const sessionId = registerSession(urls);
  vi.mocked(fetch).mockImplementation(async (input) => {
    if (String(input).endsWith('/rejected.png')) throw 'network rejected';
    return createResponse({ contentType: 'image/png' });
  });

  await expect(fetchWebSnapshotAssetsForSession({ sessionId, tabId: 42, urls })).resolves.toEqual([
    expect.objectContaining({ success: true, url: urls[0] }),
    {
      error: 'anonymous asset fetch failed',
      success: false,
      url: urls[1],
    },
  ]);
});

it('fetches registered public assets anonymously', async () => {
  const sessionId = registerSession();

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/image.png',
    })
  ).resolves.toEqual({
    base64: Buffer.from('asset').toString('base64'),
    mimeType: 'image/png',
  });

  expect(fetch).toHaveBeenCalledWith(
    'https://cdn.example.com/image.png',
    expect.objectContaining({ credentials: 'omit' })
  );
});

it('captures a binary-verified WOFF2 asset served as generic bytes', async () => {
  const url = 'https://cdn.example.com/typeface.woff2';
  const sessionId = registerSession([url]);
  vi.mocked(fetch).mockResolvedValueOnce(
    createResponse({ body: 'wOF2font-data', contentType: 'application/octet-stream' })
  );

  await expect(fetchWebSnapshotAssetForSession({ sessionId, tabId: 42, url })).resolves.toEqual({
    base64: Buffer.from('wOF2font-data').toString('base64'),
    mimeType: 'font/woff2',
  });
});

it('rejects generic response bytes that only claim a font extension', async () => {
  const url = 'https://cdn.example.com/typeface.woff2';
  const sessionId = registerSession([url]);
  vi.mocked(fetch).mockResolvedValueOnce(
    createResponse({ body: 'not-font-data', contentType: 'application/octet-stream' })
  );

  await expect(fetchWebSnapshotAssetForSession({ sessionId, tabId: 42, url })).rejects.toThrow(
    'unsupported web snapshot asset MIME type'
  );
});

it('aborts an in-flight public asset fetch when its capture request is cancelled', async () => {
  const sessionId = registerSession();
  vi.mocked(fetch).mockImplementationOnce((_input, init) => {
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });

  const pendingFetch = fetchWebSnapshotAssetForSession({
    sessionId,
    tabId: 42,
    url: 'https://cdn.example.com/image.png',
  });
  await Promise.resolve();

  cancelWebSnapshotCaptureRequest(42, 'req-1');

  await expect(pendingFetch).rejects.toThrow('Web snapshot save was cancelled');
});

it('rejects private-network asset URLs before fetch', async () => {
  const urls = [
    'http://127.0.0.1/secret.png',
    'http://printer.local/secret.png',
    'http://[fc00::1]/secret.png',
    'http://[::ffff:127.0.0.1]/secret.png',
    'https://localhost./secret.png',
    'https://printer.local./secret.png',
    'https://foo.localhost./secret.png',
    'https://[fe90::1]/secret.png',
    'https://[febf::1]/secret.png',
  ];
  const sessionId = registerSession(urls);

  for (const url of urls) {
    await expect(
      fetchWebSnapshotAssetForSession({
        sessionId,
        tabId: 42,
        url,
      })
    ).rejects.toThrow('private network asset URLs are not allowed');
  }

  expect(fetch).not.toHaveBeenCalled();
});

it('rejects public insecure HTTP asset URLs before fetch', async () => {
  const sessionId = registerSession(['http://cdn.example.com/image.png']);

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'http://cdn.example.com/image.png',
    })
  ).rejects.toThrow('insecure web snapshot asset URLs are not allowed');

  expect(fetch).not.toHaveBeenCalled();
});

it('rejects external asset redirects without following their target', async () => {
  const sourceUrl = 'https://cdn.example.com/image.png';
  const sessionId = registerSession([sourceUrl]);
  const redirect = createResponse({ bodyStream: null, status: 302 });
  redirect.headers.set('location', 'https://redirected.example.com/image.png');
  vi.mocked(fetch).mockResolvedValueOnce(redirect);

  await expect(
    fetchWebSnapshotAssetForSession({ sessionId, tabId: 42, url: sourceUrl })
  ).rejects.toThrow('web snapshot asset redirects are not allowed');
  expect(fetch).toHaveBeenCalledWith(
    sourceUrl,
    expect.objectContaining({ credentials: 'omit', redirect: 'manual' })
  );
});

it('follows an external asset redirect only when the capture session allows it', async () => {
  const sourceUrl = 'https://cdn.example.com/image.png';
  const sessionId = registerSession([sourceUrl], true);
  vi.mocked(fetch).mockResolvedValueOnce(
    createResponse({
      contentType: 'image/png',
      url: 'https://avatars.example.com/image.png',
    })
  );

  await expect(
    fetchWebSnapshotAssetForSession({ sessionId, tabId: 42, url: sourceUrl })
  ).resolves.toEqual({
    base64: Buffer.from('asset').toString('base64'),
    mimeType: 'image/png',
  });
  expect(fetch).toHaveBeenCalledWith(
    sourceUrl,
    expect.objectContaining({ credentials: 'omit', redirect: 'follow' })
  );
});

it('rejects a redirected response whose final URL is not a public HTTPS target', async () => {
  const sourceUrl = 'https://cdn.example.com/image.png';
  const sessionId = registerSession([sourceUrl], true);
  vi.mocked(fetch).mockResolvedValueOnce(
    createResponse({ contentType: 'image/png', url: 'http://127.0.0.1/image.png' })
  );

  await expect(
    fetchWebSnapshotAssetForSession({ sessionId, tabId: 42, url: sourceUrl })
  ).rejects.toThrow('private network asset URLs are not allowed');
});

it('rejects an allowed redirect when the final response URL is unavailable', async () => {
  const sourceUrl = 'https://cdn.example.com/image.png';
  const sessionId = registerSession([sourceUrl], true);

  await expect(
    fetchWebSnapshotAssetForSession({ sessionId, tabId: 42, url: sourceUrl })
  ).rejects.toThrow('redirected asset response URL is unavailable');
});

it('rejects URLs that were not registered for the session', async () => {
  const sessionId = registerSession(['https://cdn.example.com/image.png']);

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/other.png',
    })
  ).rejects.toThrow('Web snapshot asset was not registered for this session');

  expect(fetch).not.toHaveBeenCalled();
});

it('rejects unsupported MIME types and HTTP failures', async () => {
  const sessionId = registerSession([
    'https://cdn.example.com/page.html',
    'https://cdn.example.com/missing.png',
  ]);
  vi.mocked(fetch)
    .mockResolvedValueOnce(createResponse({ contentType: 'text/html' }))
    .mockResolvedValueOnce(createResponse({ ok: false, status: 404 }));

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/page.html',
    })
  ).rejects.toThrow('unsupported web snapshot asset MIME type');
  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/missing.png',
    })
  ).rejects.toThrow('HTTP 404');
});

it('returns registered SVG bytes for mandatory content-side sanitization', async () => {
  const sessionId = registerSession(['https://cdn.example.com/unsafe.svg']);
  vi.mocked(fetch).mockResolvedValueOnce(
    createResponse({
      body: '<svg onload="alert(1)"><foreignObject /></svg>',
      contentType: 'image/svg+xml',
    })
  );

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/unsafe.svg',
    })
  ).resolves.toEqual({
    base64: 'PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48Zm9yZWlnbk9iamVjdCAvPjwvc3ZnPg==',
    mimeType: 'image/svg+xml',
  });
});

it('rejects oversized assets from content-length before reading the body', async () => {
  const sessionId = registerSession();
  const response = createResponse({
    bodyStream: null,
    contentLength: String(TEN_MIB + 1),
    contentType: 'image/png',
  });
  vi.mocked(fetch).mockResolvedValueOnce(response);

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/image.png',
    })
  ).rejects.toThrow('web snapshot asset is too large');
  expect(response.blob).not.toHaveBeenCalled();
});

it('rejects oversized streaming assets without relying on content-length', async () => {
  const sessionId = registerSession();
  vi.mocked(fetch).mockResolvedValueOnce(
    createResponse({
      bodyStream: createBodyStream(['a'.repeat(TEN_MIB), 'b']),
      contentType: 'image/png',
    })
  );

  await expect(
    fetchWebSnapshotAssetForSession({
      sessionId,
      tabId: 42,
      url: 'https://cdn.example.com/image.png',
    })
  ).rejects.toThrow('web snapshot asset is too large');
});
