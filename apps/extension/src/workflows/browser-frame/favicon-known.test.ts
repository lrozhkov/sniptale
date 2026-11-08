// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireWindowHeaderFavicon } from './favicon';
import { rasterizeWindowHeaderIcon } from './icon-raster';

vi.mock('./icon-raster', () => ({
  rasterizeWindowHeaderIcon: vi.fn(async () => 'data:image/png;base64,bm9ybWFsaXplZA=='),
}));
const png = 'data:image/png;base64,bm9ybWFsaXplZA==';
const signal = () => new AbortController().signal;
const shell = () =>
  new Response('<html><body><main id="app"></main></body></html>', {
    headers: { 'content-type': 'text/html' },
  });
const raster = () =>
  new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
    headers: { 'content-type': 'image/png' },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('File', NodeFile);
});
afterEach(() => vi.unstubAllGlobals());

it('acquires a browser-known icon when server HTML is an application shell', async () => {
  const fetch = vi.fn(async (url: string) => {
    if (url === 'https://example.test/page') return shell();
    if (url === 'https://cdn.example.test/app.png') return raster();
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  expect(
    await acquireWindowHeaderFavicon(
      'example.test/page',
      signal(),
      undefined,
      'https://cdn.example.test/app.png'
    )
  ).toBe(png);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://example.test/page',
    'https://cdn.example.test/app.png',
  ]);
  expect(fetch).toHaveBeenLastCalledWith(
    'https://cdn.example.test/app.png',
    expect.objectContaining({
      credentials: 'omit',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
  );
});

it('keeps HTML priority, then tries the hint and existing favicon fallback', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  fetch.mockResolvedValueOnce(
    new Response('<link rel="icon" href="html.png">', {
      headers: { 'content-type': 'text/html' },
    })
  );
  vi.stubGlobal('fetch', fetch);
  expect(
    await acquireWindowHeaderFavicon(
      'example.test/page',
      signal(),
      undefined,
      'https://cdn.example.test/app.png'
    )
  ).toBeNull();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://example.test/page',
    'https://example.test/html.png',
    'https://cdn.example.test/app.png',
    'https://example.test/favicon.ico',
  ]);
});

it('deduplicates a known icon already found in HTML or equal to the fallback', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  fetch.mockResolvedValueOnce(
    new Response('<link rel="icon" href="/favicon.ico">', {
      headers: { 'content-type': 'text/html' },
    })
  );
  await acquireWindowHeaderFavicon(
    'example.test',
    signal(),
    undefined,
    'https://example.test/favicon.ico'
  );
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://example.test/',
    'https://example.test/favicon.ico',
  ]);
});

it('rejects unsafe hints before network and preserves favicon fallback', async () => {
  for (const hint of [
    'http://example.test/icon.png',
    'https://localhost/icon.png',
    'https://user:pass@example.test/icon.png',
    'javascript:alert(1)',
  ]) {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    fetch.mockResolvedValueOnce(shell());
    vi.stubGlobal('fetch', fetch);
    expect(await acquireWindowHeaderFavicon('example.test', signal(), undefined, hint)).toBeNull();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/',
      'https://example.test/favicon.ico',
    ]);
  }
});

it('sanitizes a remote SVG before rasterizing and returns only normalized PNG', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  fetch
    .mockResolvedValueOnce(shell())
    .mockResolvedValueOnce(
      new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 16" onload="bad()"><script>bad()</script><image href="https://example.test/tracker"/><rect width="32" height="16" fill="red"/><animate attributeName="x"/></svg>',
        { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } }
      )
    );
  vi.stubGlobal('fetch', fetch);
  expect(
    await acquireWindowHeaderFavicon(
      'example.test',
      signal(),
      undefined,
      'https://cdn.example.test/icon.svg'
    )
  ).toBe(png);
  const blob = vi.mocked(rasterizeWindowHeaderIcon).mock.calls[0]![0];
  const svg = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  expect(blob.type).toBe('image/svg+xml');
  expect(svg).toContain('width="32"');
  expect(svg).toContain('height="16"');
  expect(svg).toContain('fill="red"');
  expect(svg).not.toMatch(/script|onload|https:|animate/);
});

it('keeps the remote SVG byte cap and falls back after malformed SVG', async () => {
  for (const svg of ['<svg', 'x'.repeat(256 * 1024 + 1)]) {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    fetch.mockResolvedValueOnce(shell()).mockResolvedValueOnce(
      new Response(svg, {
        headers: { 'content-type': 'image/svg+xml' },
      })
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      await acquireWindowHeaderFavicon(
        'example.test',
        signal(),
        undefined,
        'https://cdn.example.test/icon.svg'
      )
    ).toBeNull();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/',
      'https://cdn.example.test/icon.svg',
      'https://example.test/favicon.ico',
    ]);
  }
  expect(rasterizeWindowHeaderIcon).not.toHaveBeenCalled();
});
