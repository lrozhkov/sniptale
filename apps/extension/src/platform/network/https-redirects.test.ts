import { afterEach, expect, it, vi } from 'vitest';

import { resolvePublicHttpsRedirect } from './https-redirects';

const PUBLIC_URL = 'https://example.com/page';
const UNSAFE_ADDRESSES = [
  'http://example.com/page',
  'https://user:secret@example.com/page',
  'https://:secret@example.com/page',
  'https://localhost/page',
  'https://printer.local/page',
  'https://127.0.0.1/page',
  'https://10.1.2.3/page',
  'https://169.254.1.2/page',
  'https://172.31.1.2/page',
  'https://192.168.1.2/page',
  'https://[::1]/page',
  'https://[fc00::1]/page',
  'https://[fe80::1]/page',
  'https://[::ffff:127.0.0.1]/page',
];

function responseAt(address: string, status = 200): Response {
  const response = new Response(null, { status });
  Object.defineProperty(response, 'url', { value: address });
  return response;
}

afterEach(() => vi.unstubAllGlobals());

it.each(UNSAFE_ADDRESSES)(
  'rejects initial URL %s before guard installation or network access',
  async (address) => {
    const ensureGuard = vi.fn(async () => undefined);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      resolvePublicHttpsRedirect(new URL(address), new AbortController().signal, ensureGuard)
    ).rejects.toThrow('Unsupported HTTPS redirect destination');
    expect(ensureGuard).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  }
);

it('waits for the guard before an anonymous HEAD and returns the final cross-host URL', async () => {
  const installation = Promise.withResolvers<void>();
  const ensureGuard = vi.fn(() => installation.promise);
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(responseAt('https://cdn.example.net/canonical#part'));
  vi.stubGlobal('fetch', fetchMock);
  const signal = new AbortController().signal;
  const resolution = resolvePublicHttpsRedirect(
    new URL(`${PUBLIC_URL}#fragment`),
    signal,
    ensureGuard
  );
  expect(ensureGuard).toHaveBeenCalledOnce();
  expect(fetchMock).not.toHaveBeenCalled();
  installation.resolve();
  await expect(resolution).resolves.toEqual(new URL('https://cdn.example.net/canonical'));
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(PUBLIC_URL, {
    method: 'HEAD',
    credentials: 'omit',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    signal,
  });
});

it('allows HTTPS DNS intranet names through the same resolver', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(responseAt('https://intranet/canonical'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    resolvePublicHttpsRedirect(
      new URL('https://intranet/'),
      new AbortController().signal,
      async () => undefined
    )
  ).resolves.toEqual(new URL('https://intranet/canonical'));
});

it('makes no network request if guard installation fails', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    resolvePublicHttpsRedirect(new URL(PUBLIC_URL), new AbortController().signal, async () => {
      throw new Error('guard unavailable');
    })
  ).rejects.toThrow('guard unavailable');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('stops cancellation before guard installation', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  const ensureGuard = vi.fn(async () => undefined);
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    resolvePublicHttpsRedirect(new URL(PUBLIC_URL), controller.signal, ensureGuard)
  ).rejects.toThrow('cancelled');
  expect(ensureGuard).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('stops cancellation while the guard installs before network access', async () => {
  const installation = Promise.withResolvers<void>();
  const controller = new AbortController();
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const resolution = resolvePublicHttpsRedirect(
    new URL(PUBLIC_URL),
    controller.signal,
    () => installation.promise
  );
  controller.abort(new Error('cancelled'));
  installation.resolve();
  await expect(resolution).rejects.toThrow('cancelled');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('propagates cancellation of an in-flight HEAD without another request', async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, options) => {
    started.resolve();
    return new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
        once: true,
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const resolution = resolvePublicHttpsRedirect(
    new URL(PUBLIC_URL),
    controller.signal,
    async () => undefined
  );
  await started.promise;
  controller.abort(new Error('cancelled'));
  await expect(resolution).rejects.toThrow('cancelled');
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('cancels an unexpected response body and rejects cancellation before publishing the URL', async () => {
  const controller = new AbortController();
  const cancel = vi.fn(async () => controller.abort(new Error('cancelled')));
  const response = responseAt('https://cdn.example.com/icon');
  Object.defineProperty(response, 'body', { value: { cancel } });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
  await expect(
    resolvePublicHttpsRedirect(new URL(PUBLIC_URL), controller.signal, async () => undefined)
  ).rejects.toThrow('cancelled');
  expect(cancel).toHaveBeenCalledOnce();
});

it.each([403, 405, 500])('rejects HEAD status %s without trying GET', async (status) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseAt(PUBLIC_URL, status));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    resolvePublicHttpsRedirect(
      new URL(PUBLIC_URL),
      new AbortController().signal,
      async () => undefined
    )
  ).rejects.toThrow('HTTPS redirect resolution failed');
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each(['', ...UNSAFE_ADDRESSES, 'not a URL'])('rejects final URL %s', async (address) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseAt(address));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    resolvePublicHttpsRedirect(
      new URL(PUBLIC_URL),
      new AbortController().signal,
      async () => undefined
    )
  ).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('propagates redirect-loop or network failure without retrying an unguarded transport', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError('redirect limit exceeded'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    resolvePublicHttpsRedirect(
      new URL(PUBLIC_URL),
      new AbortController().signal,
      async () => undefined
    )
  ).rejects.toThrow('redirect limit exceeded');
  expect(fetchMock).toHaveBeenCalledOnce();
});
