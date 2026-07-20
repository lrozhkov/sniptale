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

function setSelectedSrcsetCandidate(element: Element | null, value: string): void {
  if (!element) {
    throw new Error('Expected element to set selected srcset candidate.');
  }

  element.setAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE, value);
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
  document.body.innerHTML = '';
  resetContentRuntimeMessagingMock();
  vi.unstubAllGlobals();
});

it('fetches cross-origin DOM assets anonymously through the background route', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: true, snapshotSessionId: 'snapshot-session-1' })
    .mockResolvedValueOnce({ success: true, base64: 'cG5n', mimeType: 'image/png' });
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
    url: 'https://cdn.example.com/logo.png',
  });
  expect(result.assets).toHaveLength(1);
  expect(result.snapshotSessionId).toBe('snapshot-session-1');
  expect(document.querySelector('img')?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/);
});

it('skips anonymous cross-origin SVG assets returned by the background route', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: true, snapshotSessionId: 'snapshot-session-svg' })
    .mockResolvedValueOnce({ success: true, base64: 'PHN2Zy8+', mimeType: 'image/svg+xml' });
  document.body.innerHTML = '<img src="https://cdn.example.com/unsafe.svg">';

  const result = await collectAssets({ allowAnonymousCrossOriginAssets: true });

  expect(result.assets).toEqual([]);
  expect(document.querySelector('img')?.hasAttribute('src')).toBe(false);
  expect(result.warnings).toEqual([
    'Asset skipped: https://cdn.example.com/unsafe.svg (unsupported web snapshot asset MIME type)',
  ]);
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
  const srcset = document.querySelector('img')?.getAttribute('srcset') ?? '';

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
  expect(srcset).toContain('../assets/1-');
  expect(srcset).not.toContain('https://cdn.example.com/missing.svg?token=secret#hash 2x');
  expect(result.assets).toHaveLength(1);
  expect(result.snapshotSessionId).toBe('snapshot-session-2');
  expect(result.privacyWarnings).toEqual([
    expect.stringContaining('Authenticated same-site assets were enabled'),
    'Asset skipped: https://cdn.example.com/missing.svg (web snapshot srcset candidate was not selected)',
    'Asset skipped: http://localhost:3000/fallback.png (web snapshot fallback asset was not selected)',
  ]);
  expect(result.warnings).toEqual([]);
});

it('skips same-origin credentialed assets when the persisted setting is disabled', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    snapshotSessionId: 'snapshot-session-3',
  });
  document.body.innerHTML = '<img src="/private.png?token=secret#hash">';

  const result = await collectAssets({ allowAuthenticatedSameOriginAssets: false });

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

  const result = await collectAssets({ allowAuthenticatedSameOriginAssets: true });

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
  document.body.innerHTML = [
    '<img id="first" src="/first.png">',
    '<img id="second" src="/second.png">',
    '<img id="third" src="/third.png">',
    '<img id="fourth" src="/fourth.png">',
  ].join('');

  const result = await collectAssets({ allowAuthenticatedSameOriginAssets: true });

  expect(fetch).toHaveBeenCalledTimes(3);
  expect(result.assets).toHaveLength(3);
  expect(document.querySelector('#fourth')?.hasAttribute('src')).toBe(false);
  expect(result.warnings).toEqual([
    'Asset skipped: http://localhost:3000/fourth.png (web snapshot asset budget exceeded)',
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
    '<img id="visible" src="/visible.png">',
  ].join('');

  const result = await collectAssets({ allowAuthenticatedSameOriginAssets: true });

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('http://localhost:3000/visible.png', {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(document.querySelector('#hidden')?.hasAttribute('src')).toBe(false);
  expect(document.querySelector('#offscreen')?.hasAttribute('src')).toBe(false);
  expect(document.querySelector('#visible')?.getAttribute('src')).toMatch(/^\.\.\/assets\/1-/);
  expect(result.assets).toHaveLength(1);
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

  const result = await collectAssets({ allowAnonymousCrossOriginAssets: false });

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
