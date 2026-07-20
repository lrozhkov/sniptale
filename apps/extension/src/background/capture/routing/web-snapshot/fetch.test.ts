import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  authorizeWebSnapshotCaptureRequest,
  registerWebSnapshotAssetSession,
  resetWebSnapshotAssetSessionsForTests,
} from './session';
import { fetchWebSnapshotAssetForSession } from './fetch';

const TEN_MIB = 10 * 1024 * 1024;

function createResponse(args: {
  body?: string;
  bodyStream?: ReadableStream<Uint8Array> | null;
  contentLength?: string;
  contentType?: string;
  ok?: boolean;
  status?: number;
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

function registerSession(urls: string[] = ['https://cdn.example.com/image.png']): string {
  authorizeWebSnapshotCaptureRequest(42, 'req-1', { allowAnonymousCrossOriginAssets: true });
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
  resetWebSnapshotAssetSessionsForTests();
  vi.unstubAllGlobals();
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

it('rejects SVG assets before returning anonymous fetch bytes', async () => {
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
  ).rejects.toThrow('unsupported web snapshot asset MIME type');
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
