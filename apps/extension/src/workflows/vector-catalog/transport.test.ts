import { expect, it, vi } from 'vitest';
import { executeVectorCatalogRequest } from './transport';
import type { CatalogRequest } from '../../features/editor/vector-catalog';
const source = {
  sourceId: 'https://example.test/nested/iconify',
  incarnation: 'source',
  generation: 2,
};
const search: CatalogRequest = {
  operation: 'search',
  query: 'private heart',
  prefix: 'mdi',
  requestId: 'search',
  source,
};
const result = () =>
  new Response(JSON.stringify({ icons: ['mdi:heart'], total: 1, limit: 64, start: 0 }));
it(
  'preserves the selected base path and rechecks admission immediately before ' +
    'anonymous nonredirecting fetch',
  async () => {
    const order: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      order.push('fetch');
      return result();
    });
    const response = await executeVectorCatalogRequest(search, {
      fetch,
      beforeSend: async () => {
        order.push('admit');
      },
    });
    expect(order).toEqual(['admit', 'fetch']);
    const input = fetch.mock.calls[0]![0];
    if (typeof input !== 'string') throw new Error('Expected a URL string');
    const url = new URL(input);
    expect(url.origin + url.pathname).toBe('https://example.test/nested/iconify/search');
    expect(url.searchParams.get('query')).toBe('private heart');
    expect(url.searchParams.get('prefix')).toBe('mdi');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      })
    );
    expect(response).toMatchObject({ operation: 'search', data: { icons: ['mdi:heart'] }, source });
  }
);
it('performs no network request after failed admission and never falls back to another host', async () => {
  const fetch = vi.fn();
  await expect(
    executeVectorCatalogRequest(search, {
      fetch,
      beforeSend: async () => {
        throw new Error('private admission detail');
      },
    })
  ).rejects.toMatchObject({ code: 'network-failed' });
  expect(fetch).not.toHaveBeenCalled();
});
it('bounds streaming bodies even with a false small content length', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
            controller.close();
          },
        }),
        { headers: { 'content-length': '1' } }
      )
  );
  await expect(
    executeVectorCatalogRequest(search, { fetch, beforeSend: async () => {} })
  ).rejects.toMatchObject({ code: 'response-too-large' });
});
it('reports bounded Retry-After without exposing provider response bodies', async () => {
  const fetch = vi.fn(
    async () =>
      new Response('private-server-error', { status: 429, headers: { 'Retry-After': '120' } })
  );
  await expect(
    executeVectorCatalogRequest(search, { fetch, beforeSend: async () => {} })
  ).rejects.toMatchObject({
    code: 'rate-limited',
    retryAfterSeconds: 120,
    message: 'Vector catalog request failed: rate-limited.',
  });
  expect(fetch).toHaveBeenCalledOnce();
});
it('checks each endpoint independently and reports an absent search capability', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ mdi: { name: 'Material', total: 1 } })))
    .mockResolvedValueOnce(new Response('', { status: 404 }));
  const admit = vi.fn(async () => {});
  const response = await executeVectorCatalogRequest(
    { operation: 'check', requestId: 'check', source },
    { fetch, beforeSend: admit }
  );
  expect(response).toMatchObject({ data: { collections: true, search: false } });
  expect(admit).toHaveBeenCalledTimes(2);
});
it('rejects wrong collection identity and malformed metadata without fallback', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ prefix: 'foreign', icons: {} })));
  await expect(
    executeVectorCatalogRequest(
      { operation: 'assets', prefix: 'mdi', names: ['heart'], requestId: 'assets', source },
      { fetch, beforeSend: async () => {} }
    )
  ).rejects.toMatchObject({ code: 'response-invalid' });
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([
  [403, 'forbidden'],
  [404, 'unsupported-search'],
  [405, 'unsupported-search'],
  [501, 'unsupported-search'],
] as const)(
  'classifies HTTP %s with a fixed code and discards provider text',
  async (status, code) => {
    const fetch = vi.fn(async () => new Response('private provider error', { status }));
    await expect(
      executeVectorCatalogRequest(search, { fetch, beforeSend: async () => {} })
    ).rejects.toMatchObject({ code });
    expect(fetch).toHaveBeenCalledOnce();
  }
);
