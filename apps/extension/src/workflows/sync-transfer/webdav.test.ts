// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createWebdavRemoteStore } from './webdav';

const signal = () => new AbortController().signal;
const auth = { kind: 'basic' as const, username: 'alice', password: 'private-password' };
function entry(href: string, directory = true, size = '0'): string {
  return [
    `<d:response><d:href>${href}</d:href><d:propstat><d:prop>`,
    `<d:resourcetype>${directory ? '<d:collection/>' : ''}</d:resourcetype>`,
    `<d:getcontentlength>${size}</d:getcontentlength></d:prop>`,
    '<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
  ].join('');
}
function xml(entries = entry('/root/')): Response {
  return new Response(`<d:multistatus xmlns:d="DAV:">${entries}</d:multistatus>`, {
    status: 207,
    headers: { 'content-type': 'application/xml' },
  });
}
function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}
const fetchMock = vi.fn<typeof fetch>();
async function store(rootUrl = 'https://dav.example/root/') {
  return createWebdavRemoteStore({ rootUrl, authentication: auth }, signal());
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => xml(entry(new URL(urlOf(input)).pathname)));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('probes through real DAV parsing and uploads the identical native Blob without materializing it', async () => {
  const remote = await store();
  const body = new Blob(['original bytes']);
  const materialize = vi.spyOn(body, 'arrayBuffer').mockRejectedValue(new Error('must not copy'));
  const cancelled = vi.fn();
  fetchMock.mockImplementation(async (_input, init) =>
    init?.method === 'PUT'
      ? new Response(new ReadableStream({ cancel: cancelled }), { status: 201 })
      : xml()
  );
  const requestSignal = signal();
  await remote.write('object.bin', body, requestSignal);
  const [, options] = fetchMock.mock.calls.at(-1)!;
  expect(options?.body).toBe(body);
  expect(options?.signal).toBe(requestSignal);
  expect(options?.credentials).toBe('omit');
  expect(options?.redirect).toBe('error');
  expect(new Headers(options?.headers).get('authorization')).toBe(
    `Basic ${btoa('alice:private-password')}`
  );
  expect(materialize).not.toHaveBeenCalled();
  expect(cancelled).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
});

it('returns immediate objects and child prefixes through library XML parsing', async () => {
  const remote = await store();
  fetchMock.mockResolvedValueOnce(
    xml(entry('/root/') + entry('/root/a%20b.bin', false, '123') + entry('/root/nested/'))
  );
  await expect(remote.list('', { signal: signal() })).resolves.toEqual({
    objects: [{ key: 'a b.bin', size: 123 }],
    prefixes: ['nested/'],
    nextCursor: null,
  });
  fetchMock.mockResolvedValueOnce(
    xml(entry('/root/nested/') + entry('/root/nested/file', false, '4'))
  );
  await expect(remote.list('nested/', { signal: signal() })).resolves.toEqual({
    objects: [{ key: 'nested/file', size: 4 }],
    prefixes: [],
    nextCursor: null,
  });
  expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'PROPFIND')).toBe(true);
});

it.each([
  '/root/../outside',
  '/root/%2e%2e/outside',
  '/root/a%2fb',
  '/root/a%252fb',
  'https://elsewhere.example/root/a',
  '/root2/a',
  '/root/a/b',
  '/root/a?token=private',
])('rejects untrusted href before library path normalization: %s', async (href) => {
  const remote = await store();
  fetchMock.mockResolvedValueOnce(xml(entry(href, false, '1')));
  await expect(remote.list('', { signal: signal() })).rejects.toMatchObject({
    code: 'invalid-response',
  });
});

it('rejects duplicate or conflicting entries and unsupported pagination', async () => {
  const remote = await store();
  fetchMock.mockResolvedValueOnce(xml(entry('/root/a', false, '1') + entry('/root/a/')));
  await expect(remote.list('', { signal: signal() })).rejects.toMatchObject({
    code: 'invalid-response',
  });
  const count = fetchMock.mock.calls.length;
  await expect(remote.list('', { signal: signal(), cursor: 'anything' })).rejects.toMatchObject({
    code: 'unsupported-cursor',
  });
  expect(fetchMock).toHaveBeenCalledTimes(count);
});

it.each([
  'http://dav.example/root',
  'https://u:p@dav.example/root',
  'https://dav.example/root?q=x',
  'https://dav.example/root#x',
  'https://dav.example/root/a%2fb',
  'https://dav.example/root/../outside',
  'https://dav.example/root/%2e%2e/outside',
])('rejects invalid root without a request: %s', async (root) => {
  await expect(store(root)).rejects.toMatchObject({ code: 'invalid-configuration' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  '',
  '../x',
  '/x',
  'x//y',
  'https://elsewhere/x',
  'a%2fb',
  'a%252fb',
  '%25252e%25252e/x',
  'a%255cb',
  'a%2500b',
  'a\\b',
  'x?secret',
  'x#fragment',
])('rejects unsafe object keys before IO: %s', async (key) => {
  const remote = await store();
  fetchMock.mockClear();
  await expect(remote.read(key, signal())).rejects.toMatchObject({ code: 'invalid-key' });
  await expect(remote.write(key, new Blob(), signal())).rejects.toMatchObject({
    code: 'invalid-key',
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  [401, 'authentication'],
  [403, 'access-denied'],
  [404, 'missing'],
  [412, 'collision'],
  [423, 'temporary'],
  [429, 'temporary'],
  [503, 'temporary'],
  [507, 'storage-full'],
])('maps refusal %s without raw response data or retry', async (status, code) => {
  const remote = await store();
  const cancelled = vi.fn();
  fetchMock.mockResolvedValueOnce(
    new Response(new ReadableStream({ cancel: cancelled }), { status: Number(status) })
  );
  const result = await remote
    .write('attempt', new Blob(['retained']), signal())
    .catch((error) => error);
  expect(result).toMatchObject({ code, status });
  expect(result.message).toBe(code);
  expect(result.cause).toBeUndefined();
  expect(cancelled).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
});

it.each([null, '1', '9000000'])(
  'bounds metadata before XML parsing with content-length %s',
  async (length) => {
    const remote = await store();
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
        },
        cancel,
      }),
      { status: 207, headers: length === null ? {} : { 'content-length': length } }
    );
    fetchMock.mockResolvedValueOnce(response);
    await expect(remote.list('', { signal: signal() })).rejects.toMatchObject({
      code: 'metadata-limit',
    });
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  }
);

it('keeps independent roots and auth while concurrent clients read streams', async () => {
  const [alice, bob] = await Promise.all([
    store(),
    createWebdavRemoteStore(
      {
        rootUrl: 'https://dav.example/bob/',
        authentication: { kind: 'bearer', accessToken: 'bob-token' },
      },
      signal()
    ),
  ]);
  fetchMock.mockImplementation(async () => new Response('streamed'));
  const [left, right] = await Promise.all([alice.read('x', signal()), bob.read('x', signal())]);
  expect(await new Response(left).text()).toBe('streamed');
  expect(await new Response(right).text()).toBe('streamed');
  const calls = fetchMock.mock.calls.slice(-2);
  expect(urlOf(calls[0]![0])).toBe('https://dav.example/root/x');
  expect(urlOf(calls[1]![0])).toBe('https://dav.example/bob/x');
  expect(new Headers(calls[0]![1]?.headers).get('authorization')).toMatch(/^Basic /);
  expect(new Headers(calls[1]![1]?.headers).get('authorization')).toBe('Bearer bob-token');
});

it('uses explicit cancellation during root discovery and every parent operation', async () => {
  const controller = new AbortController();
  fetchMock.mockImplementation(async (_input, init) => {
    expect(init?.signal).toBe(controller.signal);
    controller.abort();
    throw new Error('private URL');
  });
  await expect(
    createWebdavRemoteStore(
      { rootUrl: 'https://dav.example/root/', authentication: auth },
      controller.signal
    )
  ).rejects.toMatchObject({ code: 'cancelled' });
  fetchMock.mockResolvedValue(xml());
  const remote = await store();
  const writeController = new AbortController();
  fetchMock.mockImplementation(async (_input, init) => {
    expect(init?.signal).toBe(writeController.signal);
    writeController.abort();
    return new Response(null, { status: 404 });
  });
  await expect(remote.write('a/b/x', new Blob(), writeController.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
});

it('verifies a concurrent MKCOL 405 once and never repeats PUT', async () => {
  const remote = await store();
  let stats = 0;
  fetchMock.mockImplementation(async (_input, init) => {
    if (init?.method === 'PROPFIND') {
      stats += 1;
      return stats === 1 ? new Response(null, { status: 404 }) : xml(entry('/root/a/'));
    }
    if (init?.method === 'MKCOL') expect(init.body).toBeUndefined();
    return new Response(null, { status: init?.method === 'MKCOL' ? 405 : 201 });
  });
  await remote.write('a/x', new Blob(['x']), signal());
  expect(fetchMock.mock.calls.slice(1).map(([, init]) => init?.method)).toEqual([
    'PROPFIND',
    'MKCOL',
    'PROPFIND',
    'PUT',
  ]);
});

it('cancels the streamed GET body on request abort and sanitizes stream failure', async () => {
  const remote = await store();
  const cancelled = vi.fn();
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancelled })));
  const controller = new AbortController();
  const stream = await remote.read('file', controller.signal);
  const pending = stream.getReader().read();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  expect(cancelled).toHaveBeenCalledOnce();
});

it('refuses a file selected as the root and a redirect response', async () => {
  fetchMock.mockResolvedValueOnce(xml(entry('/root/', false)));
  await expect(store()).rejects.toMatchObject({ code: 'collision' });
  fetchMock.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { location: 'https://elsewhere.example/private' },
    })
  );
  await expect(store()).rejects.toMatchObject({ code: 'invalid-response' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('does not start PUT after cancellation during parent creation', async () => {
  const remote = await store();
  const controller = new AbortController();
  fetchMock.mockImplementation(async (_input, init) => {
    expect(init?.signal).toBe(controller.signal);
    if (init?.method === 'PROPFIND') return new Response(null, { status: 404 });
    controller.abort();
    return new Response(null, { status: 201 });
  });
  await expect(remote.write('parent/file', new Blob(), controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
});

it('sanitizes a failure while reading GET bytes and cancels on consumer disposal', async () => {
  const remote = await store();
  fetchMock.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error('private URL and token'));
        },
      })
    )
  );
  const stream = await remote.read('file', signal());
  await expect(stream.getReader().read()).rejects.toMatchObject({
    code: 'transport',
    message: 'transport',
  });
  const cancel = vi.fn();
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ cancel })));
  await (await remote.read('file', signal())).cancel();
  expect(cancel).toHaveBeenCalledOnce();
});

it('accepts directory metadata when only irrelevant content length has a failed propstat', async () => {
  const directoryWithMissingLength = (href: string) =>
    [
      `<d:response><d:href>${href}</d:href><d:propstat><d:prop>`,
      '<d:resourcetype><d:collection/></d:resourcetype></d:prop>',
      '<d:status>HTTP/1.1 200 OK</d:status></d:propstat>',
      '<d:propstat><d:prop><d:getcontentlength/></d:prop>',
      '<d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>',
    ].join('');
  fetchMock.mockResolvedValueOnce(xml(directoryWithMissingLength('/root/')));
  const remote = await store();
  const probeBody = fetchMock.mock.calls[0]?.[1]?.body;
  expect(typeof probeBody).toBe('string');
  expect(probeBody).toContain('resourcetype');
  expect(probeBody).not.toContain('getcontentlength');
  fetchMock.mockResolvedValueOnce(
    xml(
      directoryWithMissingLength('/root/') +
        directoryWithMissingLength('/root/child/') +
        entry('/root/file', false, '7')
    )
  );
  await expect(remote.list('', { signal: signal() })).resolves.toEqual({
    objects: [{ key: 'file', size: 7 }],
    prefixes: ['child/'],
    nextCursor: null,
  });
  fetchMock.mockResolvedValueOnce(
    xml(entry('/root/file', false).replace('<d:getcontentlength>0</d:getcontentlength>', ''))
  );
  await expect(remote.list('', { signal: signal() })).rejects.toMatchObject({
    code: 'invalid-response',
  });
});

it.each(['100%.png', 'literal%20.png', 'literal%2520.png'])(
  'preserves the literal filename through DAV requests and listings: %s',
  async (filename) => {
    const remote = await store();
    const encoded = encodeURIComponent(filename);
    const body = new Blob(['literal file']);
    fetchMock.mockImplementation(async (input, init) => {
      expect(urlOf(input)).toBe(`https://dav.example/root/${encoded}`);
      if (init?.method === 'PUT') return new Response(null, { status: 201 });
      return new Response('literal file');
    });
    await remote.write(filename, body, signal());
    expect(await new Response(await remote.read(filename, signal())).text()).toBe('literal file');
    fetchMock.mockResolvedValueOnce(xml(entry('/root/') + entry(`/root/${encoded}`, false, '12')));
    await expect(remote.list('', { signal: signal() })).resolves.toMatchObject({
      objects: [{ key: filename, size: 12 }],
    });
  }
);

it('admits an encoded literal percent in the configured root without changing that root', async () => {
  const remote = await store('https://dav.example/100%25/root/');
  fetchMock.mockResolvedValueOnce(new Response('file'));
  await remote.read('capture.png', signal());
  expect(urlOf(fetchMock.mock.calls.at(-1)![0])).toBe(
    'https://dav.example/100%25/root/capture.png'
  );
});
