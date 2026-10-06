// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { acquireWindowHeaderFavicon } from './favicon';

afterEach(() => vi.unstubAllGlobals());

it('discovers public icon links relative to the site and rejects private or active URLs', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
  fetch.mockResolvedValueOnce(
    new Response(
      `
    <link rel="icon" href="http://127.0.0.1/icon.png">
    <link rel="icon" href="javascript:alert(1)">
    <link rel="ICON" href="../brand.png">
    <link rel="apple-touch-icon" href="https://cdn.example.test/icon.png">
    <link rel="stylesheet" href="https://cdn.example.test/style.css">
  `,
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    )
  );
  vi.stubGlobal('fetch', fetch);
  expect(
    await acquireWindowHeaderFavicon('example.test/docs/page', new AbortController().signal)
  ).toBeNull();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://example.test/docs/page',
    'https://example.test/brand.png',
    'https://cdn.example.test/icon.png',
    'https://example.test/favicon.ico',
  ]);
});
