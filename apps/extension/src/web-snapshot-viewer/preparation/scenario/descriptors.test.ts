// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import {
  buildViewerScenarioPageDescriptor,
  buildViewerScenarioTargetDescriptor,
  createViewerScenarioCaptureSourceAdapter,
} from './descriptors';

function createManifest(): WebSnapshotManifest {
  return {
    capturedAt: '2026-05-13T00:00:00.000Z',
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    id: 'snapshot-1',
    paths: {
      computedStyles: 'computed.css',
      domSnapshot: 'dom.json',
      errors: 'errors.json',
      manifest: 'manifest.json',
      screenshot: 'screenshot.png',
      snapshotHtml: 'index.html',
      stylesheets: 'styles.css',
      virtualDomSnapshot: 'virtual.json',
    },
    schemaVersion: 1,
    source: {
      faviconUrl: null,
      title: 'Snapshot Source',
      url: 'https://source.example/path',
    },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    warnings: [],
  };
}

function createIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframe.contentDocument?.body.replaceChildren();
  return iframe;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('builds page metadata from snapshot source and iframe viewport state', () => {
  const iframe = createIframe();
  Object.defineProperty(iframe.contentWindow, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(iframe.contentWindow, 'innerHeight', { configurable: true, value: 844 });
  Object.defineProperty(iframe.contentWindow, 'scrollX', { configurable: true, value: 12 });
  Object.defineProperty(iframe.contentWindow, 'scrollY', { configurable: true, value: 34 });

  expect(buildViewerScenarioPageDescriptor(iframe, createManifest())).toEqual({
    title: 'Snapshot Source',
    url: 'https://source.example/path',
    viewport: { x: 0, y: 0, width: 390, height: 844 },
    scrollX: 12,
    scrollY: 34,
    devicePixelRatio: expect.any(Number),
  });
});

it('builds page metadata from iframe view without ambient window', () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const iframe = createIframe();
  Object.defineProperty(iframe.contentWindow, 'devicePixelRatio', { configurable: true, value: 2 });
  Reflect.deleteProperty(globalThis, 'window');

  try {
    expect(buildViewerScenarioPageDescriptor(iframe, createManifest())).toEqual(
      expect.objectContaining({
        devicePixelRatio: 2,
      })
    );
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    }
  }
});

it('builds fallback source metadata without ambient window when iframe is missing', () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const adapter = createViewerScenarioCaptureSourceAdapter({
    iframe: null,
    manifest: createManifest(),
  });
  Reflect.deleteProperty(globalThis, 'window');

  try {
    expect(adapter.buildPageDescriptor()).toEqual({
      title: 'Snapshot Source',
      url: 'https://source.example/path',
      viewport: { x: 0, y: 0, width: 0, height: 0 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    });
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    }
  }
});

it('builds target descriptors only for snapshot iframe nodes', () => {
  const iframe = createIframe();
  const button = iframe.contentDocument!.createElement('button');
  button.textContent = 'Capture target';
  button.setAttribute('aria-label', 'Capture');
  iframe.contentDocument!.body.appendChild(button);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 110,
    bottom: 60,
    width: 100,
    height: 40,
    toJSON: () => ({}),
  });

  expect(
    buildViewerScenarioTargetDescriptor(button, iframe, {
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    })
  ).toEqual(
    expect.objectContaining({
      iframeSelector: null,
      tagName: 'button',
      text: 'Capture target',
      ariaLabel: 'Capture',
      rect: { x: 10, y: 20, width: 100, height: 40 },
    })
  );
  expect(
    buildViewerScenarioTargetDescriptor(document.body, iframe, {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  ).toBeNull();
});

it('normalizes auto-click points from viewer-shell coordinates into iframe coordinates', () => {
  const iframe = createIframe();
  vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue({
    x: 50,
    y: 80,
    left: 50,
    top: 80,
    right: 450,
    bottom: 380,
    width: 400,
    height: 300,
    toJSON: () => ({}),
  });
  const adapter = createViewerScenarioCaptureSourceAdapter({
    iframe,
    manifest: createManifest(),
  });

  expect(adapter.normalizePoint?.({ x: 70, y: 110 })).toEqual({ x: 20, y: 30 });
});
