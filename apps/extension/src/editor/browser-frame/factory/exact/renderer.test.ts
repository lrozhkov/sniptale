import { expect, it, vi } from 'vitest';
import { DEFAULT_BROWSER_FRAME_STATE } from '../../../../features/editor/document/constants';
import { renderExactBrowserFrameToDataUrl } from './renderer';

it.each(['windows', 'macos', 'linux'] as const)(
  'renders %s application chrome offline with escaped title',
  async (style) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const dataUrl = await renderExactBrowserFrameToDataUrl({
      browserFrame: {
        ...DEFAULT_BROWSER_FRAME_STATE,
        kind: 'application',
        style,
        theme: 'dark',
        title: 'Report <one>',
      },
      width: 1200,
      sourceHeight: 900,
      height: 32,
      headerHeight: 32,
      radius: 0,
    });
    const svg = decodeURIComponent(dataUrl).split('<style>')[0];
    expect(svg).toContain('Report &lt;one&gt;');
    expect(svg).toContain('width="1200"');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  }
);

it('retains only enabled persisted PNG favicon bytes and escapes the address', async () => {
  const dataUrl = await renderExactBrowserFrameToDataUrl({
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      faviconEnabled: true,
      faviconDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=',
      title: 'A title',
      url: 'example.com/?a=<x>',
    },
    width: 900,
    sourceHeight: 900,
    height: 86,
    headerHeight: 86,
    radius: 0,
  });
  const svg = decodeURIComponent(dataUrl).replace(/<style>[\s\S]*?<\/style>/, '');
  expect(svg).toContain(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII='
  );
  expect(svg).toContain('example.com/?a=&lt;x&gt;');
});
