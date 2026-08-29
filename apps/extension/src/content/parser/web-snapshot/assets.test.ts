// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MAX_WEB_SNAPSHOT_ASSET_BYTES } from './limits';
import { SELECTED_SRCSET_CANDIDATE_ATTRIBUTE } from '../page-preparation/snapshot/responsive-assets';
import {
  installContentRuntimeMessagingMock,
  resetContentRuntimeMessagingMock,
} from '../../platform/runtime-services/services.test-support';

const sendRuntimeMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { collectWebSnapshotAssets } from './assets';
function collectAssets(
  args: {
    allowAnonymousCrossOriginAssets?: boolean;
    allowAuthenticatedSameOriginAssets?: boolean;
    root?: ParentNode;
  } = {}
) {
  return collectWebSnapshotAssets(args.root ?? document, {
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets ?? false,
    allowAuthenticatedSameOriginAssets: args.allowAuthenticatedSameOriginAssets ?? false,
    requestId: 'req-web',
  });
}

function fetchedAsset(url: string, base64: string, mimeType: string) {
  return { assets: [{ base64, mimeType, success: true, url }], success: true };
}

function setSelectedSrcsetCandidate(element: Element | null, value: string): void {
  if (!element) {
    throw new Error('Expected element to set selected srcset candidate.');
  }

  element.setAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE, value);
}

function readTestBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  sendRuntimeMessageMock.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('png', { headers: { 'content-type': 'image/png' } }))
  );
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  resetContentRuntimeMessagingMock();
  vi.unstubAllGlobals();
});

it('fetches cross-origin DOM assets anonymously through the background route', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-1',
    })
    .mockResolvedValueOnce(fetchedAsset('https://cdn.example.com/logo.png', 'cG5n', 'image/png'));
  document.body.innerHTML = '<img src="https://cdn.example.com/logo.png">';

  const result = await collectAssets({ allowAnonymousCrossOriginAssets: true });

  expect(fetch).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls: ['https://cdn.example.com/logo.png'],
    requestId: 'req-web',
  });
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId: 'snapshot-session-1',
    urls: ['https://cdn.example.com/logo.png'],
  });
  expect(result.assets).toHaveLength(1);
  expect(result.snapshotSessionId).toBe('snapshot-session-1');
  expect(document.querySelector('img')?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/);
});

it('packages assets inside declarative shadow roots without treating inert template content as hidden', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-shadow',
  });
  document.body.innerHTML = [
    '<section>',
    '<template shadowrootmode="open"><img src="/shadow-image.png"></template>',
    '</section>',
  ].join('');
  const template = document.querySelector('template');
  if (!template) throw new Error('Expected declarative shadow template');

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });

  expect(fetch).toHaveBeenCalledWith('http://localhost:3000/shadow-image.png', {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(template.content.querySelector('img')?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/);
  expect(result.assets).toHaveLength(1);
});

it('packages CSS image and font resources and rewrites them to offline asset paths', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-css',
  });
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const type = url.endsWith('.woff2') ? 'font/woff2' : 'image/png';
    return new Response(url.endsWith('.woff2') ? 'font' : 'png', {
      headers: { 'content-type': type },
    });
  });
  document.head.innerHTML = [
    '<style>',
    '.hero { background-image: url("http://localhost:3000/hero.png"); }',
    '@font-face { font-family: Snapshot; src: url("http://localhost:3000/font.woff2"); }',
    '</style>',
  ].join('');

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });
  const css = document.querySelector('style')?.textContent ?? '';

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.assets.map((asset) => asset.blob.type)).toEqual(['image/png', 'font/woff2']);
  expect(css).toMatch(/background-image: url\("\.\.\/assets\/1-/u);
  expect(css).toMatch(/src: url\("\.\.\/assets\/2-/u);
  expect(css).not.toContain('http://localhost:3000');
});

it('materializes many references from one stylesheet without repeated whole-sheet rewrites', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-large-css',
  });
  const assetCount = 120;
  document.head.innerHTML = `<style>${Array.from(
    { length: assetCount },
    (_, index) =>
      `.asset-${index} { background-image: url("http://localhost:3000/asset-${index}.png"); }`
  ).join('\n')}</style>`;

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });
  const css = document.querySelector('style')?.textContent ?? '';

  expect(result.assets).toHaveLength(assetCount);
  expect(css.match(/\.\.\/assets\//gu)).toHaveLength(assetCount);
  expect(css).not.toContain('http://localhost:3000');
}, 5_000);

it('packages inline SVG CSS masks through the sanitizer instead of leaving a solid icon block', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-inline-mask',
  });
  const inlineSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><script>alert(1)</script><path d="M2 2h8v8z"/></svg>';
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(inlineSvg)}`;
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(inlineSvg, { headers: { 'content-type': 'image/svg+xml' } })
  );
  document.head.innerHTML = `<style>.search-icon { mask-image: url("${dataUrl}"); background-color: #222; }</style>`;

  const result = await collectAssets();
  const css = document.querySelector('style')?.textContent ?? '';
  const svgAsset = result.assets[0];

  expect(css).toMatch(/mask-image: url\("\.\.\/assets\/1-/u);
  expect(css).not.toContain('mask-image: ;');
  expect(svgAsset?.blob.type).toBe('image/svg+xml');
  expect(await readTestBlobText(svgAsset?.blob ?? new Blob())).not.toContain('<script');
});

it('packages a CSS-escaped utf8 SVG mask from a stylesheet without losing the icon shape', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-escaped-inline-mask',
  });
  const inlineSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M3 3h14v14H3z"/></svg>';
  const escapedDataUrl = String.raw`data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 20 20\"><path d=\"M3 3h14v14H3z\"/></svg>`;
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(inlineSvg, { headers: { 'content-type': 'image/svg+xml' } })
  );
  document.head.innerHTML = [
    '<style>.mask-icon { mask-image: url("',
    escapedDataUrl,
    '"); background-color: #777; }</style>',
  ].join('');

  const result = await collectAssets();
  const css = document.querySelector('style')?.textContent ?? '';

  expect(result.assets).toHaveLength(1);
  expect(css).toMatch(/mask-image: url\("\.\.\/assets\/1-/u);
  expect(css).not.toContain('mask-image: ;');
});

it('deduplicates repeated CSS resources across stylesheets within one capture', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-css-dedup',
  });
  document.head.innerHTML = [
    '<style>.first { background: url("http://localhost:3000/shared.png"); }</style>',
    '<style>.second { mask: url("http://localhost:3000/shared.png"); }</style>',
  ].join('');

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });
  const styles = Array.from(document.querySelectorAll('style')).map(
    (element) => element.textContent ?? ''
  );

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.assets).toHaveLength(1);
  expect(styles[0]).toContain('../assets/1-');
  expect(styles[1]).toContain('../assets/1-');
});

it('recursively packages resources discovered inside captured external stylesheets', async () => {
  const stylesheet = [
    ':root { --hero: url("./hero.png"); }',
    '.hero { background: var(--hero); }',
  ].join('');
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-nested',
    })
    .mockResolvedValueOnce(
      fetchedAsset('https://cdn.example.com/css/styles.css', btoa(stylesheet), 'text/css')
    )
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-nested',
    })
    .mockResolvedValueOnce(
      fetchedAsset('https://cdn.example.com/css/hero.png', 'cG5n', 'image/png')
    );
  document.head.innerHTML = '<link rel="stylesheet" href="https://cdn.example.com/css/styles.css">';

  const result = await collectAssets({ allowAnonymousCrossOriginAssets: true });
  const cssAsset = result.assets.find((asset) => asset.blob.type === 'text/css');

  expect(result.assets.map((asset) => asset.blob.type)).toEqual(['text/css', 'image/png']);
  expect(document.querySelector('link')?.getAttribute('href')).toMatch(/^\.\.\/assets\/1-/u);
  expect(await readTestBlobText(cssAsset?.blob ?? new Blob())).toContain('../assets/2-');
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(3, {
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls: ['https://cdn.example.com/css/hero.png'],
    requestId: 'req-web',
    snapshotSessionId: 'snapshot-session-nested',
  });
});

it('recursively packages imported stylesheets and their assets', async () => {
  const rootStylesheet = '@import url("./theme.css") screen;';
  const importedStylesheet = '.hero { background: url("./hero.png"); }';
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-import',
    })
    .mockResolvedValueOnce(
      fetchedAsset('https://cdn.example.com/css/styles.css', btoa(rootStylesheet), 'text/css')
    )
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-import',
    })
    .mockResolvedValueOnce(
      fetchedAsset('https://cdn.example.com/css/theme.css', btoa(importedStylesheet), 'text/css')
    )
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-import',
    })
    .mockResolvedValueOnce(
      fetchedAsset('https://cdn.example.com/css/hero.png', 'cG5n', 'image/png')
    );
  document.head.innerHTML = '<link rel="stylesheet" href="https://cdn.example.com/css/styles.css">';

  const result = await collectAssets({ allowAnonymousCrossOriginAssets: true });
  const [rootAsset, importedAsset] = result.assets.filter(
    (asset) => asset.blob.type === 'text/css'
  );

  expect(result.assets.map((asset) => asset.blob.type)).toEqual([
    'text/css',
    'text/css',
    'image/png',
  ]);
  expect(await readTestBlobText(rootAsset?.blob ?? new Blob())).toMatch(
    /@import url\("\.\.\/assets\/2-/u
  );
  expect(await readTestBlobText(importedAsset?.blob ?? new Blob())).toMatch(
    /url\("\.\.\/assets\/3-/u
  );
});

it('sanitizes and packages anonymous cross-origin SVG assets', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      snapshotSessionId: 'snapshot-session-svg',
    })
    .mockResolvedValueOnce(
      fetchedAsset('https://cdn.example.com/unsafe.svg', 'PHN2Zy8+', 'image/svg+xml')
    );
  document.body.innerHTML = '<img src="https://cdn.example.com/unsafe.svg">';

  const result = await collectAssets({ allowAnonymousCrossOriginAssets: true });

  expect(result.assets).toHaveLength(1);
  expect(result.assets[0]?.blob.type).toBe('image/svg+xml');
  expect(document.querySelector('img')?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/u);
  expect(result.warnings).toEqual([]);
});

it('rewrites only the selected srcset candidate and drops non-selected candidates', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-2',
  });
  document.body.innerHTML =
    '<img src="/fallback.png" srcset="/local.png 1x, https://cdn.example.com/missing.svg?token=secret#hash 2x">';
  setSelectedSrcsetCandidate(document.querySelector('img'), 'http://localhost:3000/local.png');

  const result = await collectAssets({
    allowAnonymousCrossOriginAssets: true,
    allowAuthenticatedSameOriginAssets: true,
  });
  const image = document.querySelector('img');

  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls: [],
    requestId: 'req-web',
  });
  expect(fetch).toHaveBeenCalledWith('http://localhost:3000/local.png', {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(image?.hasAttribute('srcset')).toBe(false);
  expect(image?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/u);
  expect(result.assets).toHaveLength(1);
  expect(result.snapshotSessionId).toBe('snapshot-session-2');
  expect(result.privacyWarnings).toEqual([
    expect.stringContaining('Authenticated same-site assets were enabled'),
    'Asset skipped: https://cdn.example.com/missing.svg (web snapshot srcset candidate was not selected)',
  ]);
  expect(result.warnings).toEqual([]);
});

it('normalizes the browser-selected responsive URL without republishing authored descriptors', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-complex-responsive-url',
  });
  document.body.innerHTML = '<img src="/fallback.png">';
  const image = document.querySelector('img');
  image?.setAttribute(
    'srcset',
    '/media/selected%20image.png 1x, /media/alternate.png unexpected-descriptor'
  );
  setSelectedSrcsetCandidate(image, 'http://localhost:3000/media/selected%20image.png');

  const result = await collectAssets({ allowAuthenticatedSameOriginAssets: true });

  expect(image?.hasAttribute('srcset')).toBe(false);
  expect(image?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/u);
  expect(result.assets).toHaveLength(1);
});

it('skips same-origin credentialed assets when the persisted setting is disabled', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-3',
  });
  document.body.innerHTML = '<img src="/private.png?token=secret#hash">';

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: false,
  });

  expect(fetch).not.toHaveBeenCalled();
  expect(document.querySelector('img')?.hasAttribute('src')).toBe(false);
  expect(result.assets).toHaveLength(0);
  expect(result.warnings).toEqual([
    [
      'Asset skipped: http://localhost:3000/private.png',
      '(authenticated same-origin asset fetch is disabled)',
    ].join(' '),
  ]);
});

it('skips same-origin asset redirects without following them', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-4',
  });
  vi.mocked(fetch).mockResolvedValueOnce({
    blob: async () => new Blob(['redirect'], { type: 'image/png' }),
    headers: new Headers({ 'content-type': 'image/png' }),
    ok: false,
    status: 302,
    type: 'basic',
  } as Response);
  document.body.innerHTML = '<img src="/redirect.png">';

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });

  expect(fetch).toHaveBeenCalledWith('http://localhost:3000/redirect.png', {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(document.querySelector('img')?.hasAttribute('src')).toBe(false);
  expect(result.warnings).toEqual([
    [
      'Asset skipped: http://localhost:3000/redirect.png',
      '(web snapshot asset redirects are not allowed)',
    ].join(' '),
  ]);
});

it('stops fetching more DOM assets after the aggregate byte budget is exhausted', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-budget',
  });
  vi.mocked(fetch).mockImplementation(
    async () =>
      new Response(new Uint8Array(MAX_WEB_SNAPSHOT_ASSET_BYTES).buffer, {
        headers: { 'content-type': 'image/png' },
      })
  );
  const assetCount = 13;
  document.body.innerHTML = Array.from(
    { length: assetCount },
    (_, index) => `<img id="asset-${index}" src="/asset-${index}.png">`
  ).join('');

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });

  expect(fetch).toHaveBeenCalledTimes(assetCount);
  expect(result.assets).toHaveLength(12);
  expect(document.querySelector('#asset-12')?.hasAttribute('src')).toBe(false);
  expect(result.warnings).toEqual([
    'Asset skipped: http://localhost:3000/asset-12.png (web snapshot asset budget exceeded)',
  ]);
});

it('removes hidden and offscreen DOM assets before credentialed fetch', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-hidden',
  });
  document.body.innerHTML = [
    '<img id="hidden" hidden src="/hidden.png">',
    '<img id="offscreen" style="position:absolute;left:-9999px" src="/offscreen.png">',
    '<img id="decorative" aria-hidden="true" src="/decorative.png">',
    '<img id="visible" src="/visible.png">',
  ].join('');

  const result = await collectAssets({
    allowAuthenticatedSameOriginAssets: true,
  });

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith('http://localhost:3000/decorative.png', {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(fetch).toHaveBeenCalledWith('http://localhost:3000/visible.png', {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(document.querySelector('#hidden')?.hasAttribute('src')).toBe(false);
  expect(document.querySelector('#offscreen')?.hasAttribute('src')).toBe(false);
  expect(document.querySelector('#decorative')?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/);
  expect(document.querySelector('#visible')?.getAttribute('src')).toMatch(/^\.\.\/assets\/2-/);
  expect(result.assets).toHaveLength(2);
  expect(result.privacyWarnings).toEqual([
    expect.stringContaining('Authenticated same-site assets were enabled'),
    'Asset skipped: http://localhost:3000/hidden.png (web snapshot asset is hidden or offscreen)',
    'Asset skipped: http://localhost:3000/offscreen.png (web snapshot asset is hidden or offscreen)',
  ]);
});

it('skips cross-origin DOM assets when anonymous asset capture is disabled', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-disabled',
  });
  document.body.innerHTML = '<img src="https://cdn.example.com/image.png?token=secret#hash">';

  const result = await collectAssets({
    allowAnonymousCrossOriginAssets: false,
  });

  expect(fetch).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls: [],
    requestId: 'req-web',
  });
  expect(document.querySelector('img')?.hasAttribute('src')).toBe(false);
  expect(result.assets).toHaveLength(0);
  expect(result.warnings).toEqual([
    'Asset skipped: https://cdn.example.com/image.png (anonymous cross-origin asset fetch is disabled)',
  ]);
});
