import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

it('returns parsed JSON data for successful HTTP responses', async () => {
  const { postJsonWithTimeout } = await import('./http');

  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: new Response(JSON.stringify({ ok: true })).body,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ ok: true }),
  });

  await expect(
    postJsonWithTimeout({
      url: 'https://example.test/chat',
      body: { demo: true },
      headers: { Authorization: 'Bearer secret' },
      timeoutErrorMessage: 'timed out',
    })
  ).resolves.toEqual({
    data: { ok: true },
    ok: true,
    status: 200,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://example.test/chat',
    expect.objectContaining({ redirect: 'error' })
  );
});

it.each([301, 302, 303, 307, 308])(
  'rejects redirected provider POSTs with status %i before replay',
  async (status) => {
    const { postJsonWithTimeout } = await import('./http');

    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.redirect === 'error') {
        throw new TypeError(`Redirect status ${status} blocked`);
      }

      return new Response(JSON.stringify({ redirected: true }), {
        headers: {
          'Content-Type': 'application/json',
          Location: 'https://redirected.example.test/chat',
        },
        status,
      });
    });

    await expect(
      postJsonWithTimeout({
        url: 'https://example.test/chat',
        body: { prompt: 'page prompt' },
        headers: { Authorization: 'Bearer secret' },
        timeoutErrorMessage: 'timed out',
      })
    ).rejects.toThrow(`Redirect status ${status} blocked`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/chat',
      expect.objectContaining({
        body: JSON.stringify({ prompt: 'page prompt' }),
        headers: { Authorization: 'Bearer secret' },
        redirect: 'error',
      })
    );
  }
);

it('rejects provider JSON responses above the content-length cap before parsing', async () => {
  const { postJsonWithTimeout } = await import('./http');

  fetchMock.mockResolvedValue(
    new Response('{}', {
      headers: {
        'Content-Length': '1000001',
        'Content-Type': 'application/json',
      },
      status: 200,
    })
  );

  await expect(
    postJsonWithTimeout({
      url: 'https://example.test/chat',
      body: { demo: true },
      headers: {},
      timeoutErrorMessage: 'timed out',
    })
  ).rejects.toThrow('LLM provider response exceeds 1000000 bytes');
});

it('rejects oversized chunked JSON provider responses while streaming', async () => {
  const { postJsonWithTimeout } = await import('./http');
  const chunk = new TextEncoder().encode('x'.repeat(600_000));

  fetchMock.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  );

  await expect(
    postJsonWithTimeout({
      url: 'https://example.test/chat',
      body: { demo: true },
      headers: {},
      timeoutErrorMessage: 'timed out',
    })
  ).rejects.toThrow('LLM provider response exceeds 1000000 bytes');
});

it('rejects non-JSON provider responses before body parsing', async () => {
  const { postJsonWithTimeout } = await import('./http');

  fetchMock.mockResolvedValue(
    new Response('<html>token=secret</html>', {
      headers: { 'Content-Type': 'text/html' },
      status: 200,
    })
  );

  await expect(
    postJsonWithTimeout({
      url: 'https://example.test/chat',
      body: { demo: true },
      headers: {},
      timeoutErrorMessage: 'timed out',
    })
  ).rejects.toThrow('LLM provider response must be JSON');
});

it('maps abort-like fetch failures onto the provided timeout message', async () => {
  const { postJsonWithTimeout } = await import('./http');

  fetchMock.mockImplementation(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      })
  );

  const pending = postJsonWithTimeout({
    url: 'https://example.test/chat',
    body: { demo: true },
    headers: {},
    timeoutErrorMessage: 'timed out',
  });
  const rejection = expect(pending).rejects.toThrow('timed out');

  await vi.advanceTimersByTimeAsync(30_000);

  await rejection;
});

it('rethrows non-timeout fetch failures without rewriting them', async () => {
  const { postJsonWithTimeout } = await import('./http');

  fetchMock.mockRejectedValue(new Error('network failed'));

  await expect(
    postJsonWithTimeout({
      url: 'https://example.test/chat',
      body: { demo: true },
      headers: {},
      timeoutErrorMessage: 'timed out',
    })
  ).rejects.toThrow('network failed');
});
