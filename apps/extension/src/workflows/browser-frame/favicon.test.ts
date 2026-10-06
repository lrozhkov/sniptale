import { afterEach, expect, it, vi } from 'vitest';
import { acquireWindowHeaderFavicon } from './favicon';
afterEach(() => vi.unstubAllGlobals());
it('rejects nonpublic, credentialed and non-HTTPS addresses before network access', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const address of [
    'http://example.test',
    'https://localhost',
    'https://127.0.0.1',
    'https://user:pass@example.test',
    'file:///tmp/icon',
  ])
    expect(await acquireWindowHeaderFavicon(address, new AbortController().signal)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('bounds discovery and omits credentials, redirects and referrers', async () => {
  const fetch = vi.fn(async () => new Response('missing', { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  expect(await acquireWindowHeaderFavicon('example.test', new AbortController().signal)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith(
    'https://example.test/favicon.ico',
    expect.objectContaining({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  );
});
it('propagates cancellation rather than trying more candidates', async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw controller.signal.reason;
    })
  );
  await expect(acquireWindowHeaderFavicon('example.test', controller.signal)).rejects.toMatchObject(
    { name: 'AbortError' }
  );
});

it('rejects oversized discovery and icon bodies without decoding them', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('x'.repeat(512 * 1024 + 1), { headers: { 'content-type': 'text/html' } })
    )
    .mockResolvedValueOnce(
      new Response(new Uint8Array(256 * 1024 + 1), { headers: { 'content-type': 'image/png' } })
    );
  const Image = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('Image', Image);
  expect(await acquireWindowHeaderFavicon('example.test', new AbortController().signal)).toBeNull();
  expect(Image).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('normalizes an acquired raster and releases its temporary URL', async () => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
    );
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 128;
      naturalHeight = 64;
      decode = async () => undefined;
    }
  );
  const drawImage = vi.fn();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => png,
    }),
  });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-icon');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  try {
    expect(await acquireWindowHeaderFavicon('example.test', new AbortController().signal)).toBe(
      png
    );
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 16, 64, 32);
    expect(revoke).toHaveBeenCalledWith('blob:test-icon');
  } finally {
    create.mockRestore();
    revoke.mockRestore();
  }
});
