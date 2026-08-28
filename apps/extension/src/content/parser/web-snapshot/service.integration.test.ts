// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../platform/dom-host';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../features/web-snapshot/manifest';
import { readPagePackageTestBlobText } from '../../../features/web-snapshot/package.test-support';
import { installContentRuntimeMessagingMock } from '../../platform/runtime-services/services.test-support';
import type { WebSnapshotBuildResult } from './types';

const {
  captureWebSnapshotScreenshotWithWarningsMock,
  createImageThumbnailBlobMock,
  sendRuntimeMessageMock,
} = vi.hoisted(() => ({
  captureWebSnapshotScreenshotWithWarningsMock: vi.fn(),
  createImageThumbnailBlobMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('./capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./capture')>()),
  captureWebSnapshotScreenshotWithWarnings: captureWebSnapshotScreenshotWithWarningsMock,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: createImageThumbnailBlobMock,
}));

import { buildCurrentPageWebSnapshot } from './service';

async function readSnapshotPackage(result: WebSnapshotBuildResult) {
  const readText = async (path: string): Promise<string> => {
    const entry = result.pagePackage.entries.find((candidate) => candidate.path === path);
    if (!entry) throw new Error(`Missing Page Package entry: ${path}`);
    return readPagePackageTestBlobText(entry.source);
  };
  return {
    domDiagnostics: await readText('diagnostics/standard/dom.html.txt'),
    html: await readText(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml),
    manifest: result.manifest,
  };
}

function setCurrentSrc(element: Element | null, value: string): void {
  if (!element) {
    throw new Error('Expected image element to set currentSrc.');
  }

  Object.defineProperty(element, 'currentSrc', {
    configurable: true,
    value,
  });
}

function attachIframeDocument(iframe: HTMLIFrameElement, iframeDocument: Document): void {
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    value: iframeDocument,
  });
}

function createReadableIframe(id: string, bodyHtml: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = id;
  iframe.src = `${window.location.origin}/${id}`;
  const iframeDocument = document.implementation.createHTMLDocument(id);
  iframeDocument.body.innerHTML = bodyHtml;
  attachIframeDocument(iframe, iframeDocument);
  return iframe;
}

function createUnreadableIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = 'https://external.example/private?token=secret#fragment';
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get: () => {
      throw new Error('Cross-origin');
    },
  });
  return iframe;
}

function createOverlayRoot(): HTMLElement {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const { overlayRoot } = initializeContentUiRoots(shadowRoot);
  document.body.append(host);
  return overlayRoot;
}

function appendPreparedOverlayFixture(): void {
  const overlayRoot = createOverlayRoot();
  const framesContainer = document.createElement('div');
  framesContainer.className = 'sniptale-frames-container';
  framesContainer.innerHTML = '<div class="sniptale-step-badge">1</div>';

  const highlighter = document.createElement('div');
  highlighter.className = 'sniptale-highlight-container';
  highlighter.textContent = 'Static highlighter';

  const callout = document.createElement('div');
  callout.className = 'sniptale-callout';
  callout.textContent = 'Prepared callout';
  overlayRoot.append(framesContainer, highlighter, callout);
}

beforeEach(() => {
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  vi.clearAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.title = 'Prepared web snapshot';
  window.history.replaceState(null, '', '/snapshot');
  captureWebSnapshotScreenshotWithWarningsMock.mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
    captureGeometry: {
      devicePixelRatio: 1,
      extentHeight: 768,
      extentWidth: 1024,
      outputHeight: 768,
      outputWidth: 1024,
      rootKind: 'viewport',
      rootViewport: { height: 768, width: 1024, x: 0, y: 0 },
      viewportHeight: 768,
      viewportWidth: 1024,
    },
    warnings: [],
  });
  createImageThumbnailBlobMock.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('asset', { headers: { 'content-type': 'image/png' } }))
  );
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    snapshotSessionId: 'snapshot-session-1',
  });
});

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('packages prepared iframe and overlay markup into viewer HTML and diagnostics', async () => {
  document.body.append(createReadableIframe('same-origin-frame', '<p>Iframe body content</p>'));
  appendPreparedOverlayFixture();

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
  });
  const packageEntries = await readSnapshotPackage(result);

  expect(packageEntries.html).toContain('data-virtual-iframe="true"');
  expect(packageEntries.html).toContain('Iframe body content');
  expect(packageEntries.html).toContain('sniptale-frames-container');
  expect(packageEntries.html).toContain('sniptale-highlight-container');
  expect(packageEntries.html).toContain('Prepared callout');
  expect(packageEntries.html).not.toContain('<iframe');
  expect(packageEntries.html).not.toContain(CONTENT_ROOT_ID);
  expect(packageEntries.domDiagnostics).not.toBe(packageEntries.html);
  expect(packageEntries.domDiagnostics).toContain('data-virtual-iframe="true"');
  expect(packageEntries.domDiagnostics).toContain('[text:19]');
  expect(packageEntries.domDiagnostics).not.toContain('Iframe body content');
  expect(packageEntries.domDiagnostics).not.toContain('Prepared callout');
  expect(packageEntries.manifest.viewport).toEqual({
    deviceScaleFactor: window.devicePixelRatio,
    height: window.innerHeight,
    width: window.innerWidth,
  });
});

it('keeps unreadable iframe warnings in the manifest without failing package creation', async () => {
  document.body.append(createUnreadableIframe());

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
  });
  const packageEntries = await readSnapshotPackage(result);

  expect(packageEntries.html).toContain('data-iframe-unreadable="true"');
  expect(packageEntries.html).not.toContain('token=secret');
  expect(packageEntries.manifest.warnings).toEqual(
    expect.arrayContaining([
      'Iframe content was not readable and was saved as a static placeholder: https://external.example/private',
    ])
  );
  expect(result.warnings).toEqual(packageEntries.manifest.warnings);
});

it('keeps only the selected responsive image candidate through prepared snapshot cloning', async () => {
  document.body.innerHTML =
    '<img id="responsive" srcset="/small.png 1x, /large.png 2x" src="/fallback.png">';
  setCurrentSrc(document.querySelector('#responsive'), `${window.location.origin}/large.png`);

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
  });
  const packageEntries = await readSnapshotPackage(result);

  expect(fetch).toHaveBeenCalledWith(`${window.location.origin}/large.png`, {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(packageEntries.html).toContain('srcset="../assets/1-');
  expect(packageEntries.html).not.toContain('/small.png');
  expect(packageEntries.html).not.toContain('/large.png');
  expect(packageEntries.manifest.warnings).toEqual(
    expect.arrayContaining([
      'Asset skipped: http://localhost:3000/small.png (web snapshot srcset candidate was not selected)',
    ])
  );
});

it('keeps selected picture source candidates through prepared snapshot cloning', async () => {
  document.body.innerHTML = [
    '<picture>',
    '<source id="wide-source" media="(min-width: 800px)" srcset="/wide.png 1x, /wide@2x.png 2x">',
    '<img id="picture-image" src="/fallback.png" alt="">',
    '</picture>',
  ].join('');
  setCurrentSrc(document.querySelector('#picture-image'), `${window.location.origin}/wide@2x.png`);

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
  });
  const packageEntries = await readSnapshotPackage(result);

  expect(fetch).toHaveBeenCalledWith(`${window.location.origin}/wide@2x.png`, {
    credentials: 'include',
    redirect: 'manual',
    signal: expect.any(AbortSignal),
  });
  expect(packageEntries.html).toContain('srcset="../assets/1-');
  expect(packageEntries.html).not.toContain('/wide.png');
  expect(packageEntries.html).not.toContain('/wide@2x.png');
  expect(packageEntries.manifest.warnings).toEqual(
    expect.arrayContaining([
      'Asset skipped: http://localhost:3000/wide.png (web snapshot srcset candidate was not selected)',
    ])
  );
});

it('clones the live DOM after full-page capture reveals lazy page sections', async () => {
  document.body.innerHTML = [
    '<section class="visible">First</section>',
    '<section>Second</section>',
    '<section>Third</section>',
  ].join('');
  captureWebSnapshotScreenshotWithWarningsMock.mockImplementationOnce(async () => {
    document.querySelectorAll('section').forEach((section) => section.classList.add('visible'));
    return {
      blob: new Blob(['png'], { type: 'image/png' }),
      captureGeometry: {
        devicePixelRatio: 1,
        extentHeight: 768,
        extentWidth: 1024,
        outputHeight: 768,
        outputWidth: 1024,
        rootKind: 'viewport',
        rootViewport: { height: 768, width: 1024, x: 0, y: 0 },
        viewportHeight: 768,
        viewportWidth: 1024,
      },
      warnings: [],
    };
  });

  const result = await buildCurrentPageWebSnapshot({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'req-web',
  });
  const packageEntries = await readSnapshotPackage(result);

  expect(packageEntries.html.match(/class="visible"/gu)).toHaveLength(3);
});
