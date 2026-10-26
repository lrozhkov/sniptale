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

it('refuses an already cancelled request before fetch and distinguishes caller cancellation from timeout', async () => {
  const { postJsonWithTimeout } = await import('./http');
  const controller = new AbortController();
  controller.abort();
  const options = {
    url: 'https://provider.test/chat',
    body: { prompt: 'private' },
    headers: {},
    timeoutErrorMessage: 'timed out',
  };
  await expect(
    postJsonWithTimeout({ ...options, signal: controller.signal })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).not.toHaveBeenCalled();
  const active = new AbortController();
  fetchMock.mockImplementationOnce(
    (_input: RequestInfo | URL, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Fetch stopped', 'AbortError')),
          { once: true }
        );
      })
  );
  const response = postJsonWithTimeout({ ...options, signal: active.signal });
  const refusal = expect(response).rejects.toMatchObject({ name: 'AbortError' });
  active.abort();
  await refusal;
  expect(vi.getTimerCount()).toBe(0);
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

it('returns an HTTP failure without consuming its oversized body and releases the stream', async () => {
  const { postJsonWithTimeout } = await import('./http');
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }), {
    headers: { 'Content-Type': 'application/json', 'Content-Length': '1000001' },
    status: 503,
  });
  const read = vi.spyOn(response.body!, 'getReader');
  fetchMock.mockResolvedValueOnce(response);
  await expect(
    postJsonWithTimeout({
      url: 'https://example.test/chat',
      body: { demo: true },
      headers: {},
      timeoutErrorMessage: 'timed out',
    })
  ).resolves.toEqual({ data: {}, ok: false, status: 503 });
  expect(read).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
});

it('contains SDK egress and checks authority immediately before dispatch', async () => {
  const { createProviderSdkFetch } = await import('./http');
  const beforeSend = vi.fn().mockResolvedValue(undefined);
  const transport = vi
    .fn()
    .mockResolvedValue(
      new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } })
    );
  const guarded = createProviderSdkFetch({
    baseUrl: 'https://provider.test/v1',
    beforeSend,
    transport,
  });
  await expect(guarded('https://other.test/v1/models')).rejects.toThrow(
    'provider-destination-changed'
  );
  await expect(guarded('https://provider.test/other')).rejects.toThrow(
    'provider-destination-changed'
  );
  expect(transport).not.toHaveBeenCalled();
  expect(
    await (
      await guarded('https://provider.test/v1/models', {
        credentials: 'include',
        redirect: 'follow',
      })
    ).json()
  ).toEqual({ ok: true });
  expect(beforeSend).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledWith(
    'https://provider.test/v1/models',
    expect.objectContaining({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  );
});

it('bounds SDK response streams without trusting the declared response length', async () => {
  const { createProviderSdkFetch } = await import('./http');
  const transport = vi.fn().mockResolvedValue(new Response('too many bytes'));
  const guarded = createProviderSdkFetch({
    baseUrl: 'https://provider.test/v1',
    maxResponseBytes: 3,
    transport,
  });
  await expect(
    guarded('https://provider.test/v1/chat/completions', { method: 'POST' })
  ).rejects.toThrow('provider-response-too-large');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('does not dispatch SDK requests after authorization refusal or cancellation', async () => {
  const { createProviderSdkFetch } = await import('./http');
  const transport = vi.fn();
  const guarded = createProviderSdkFetch({
    baseUrl: 'https://provider.test/v1',
    transport,
    beforeSend: async () => {
      throw new Error('scope-changed');
    },
  });
  await expect(guarded('https://provider.test/v1/models')).rejects.toThrow('scope-changed');
  expect(transport).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(
    createProviderSdkFetch({
      baseUrl: 'https://provider.test/v1',
      transport,
      signal: controller.signal,
    })('https://provider.test/v1/models')
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(transport).not.toHaveBeenCalled();
});
