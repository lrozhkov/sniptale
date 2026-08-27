// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { PREPARATION_SURFACE_RESIZE } from '../../../workflows/page-preparation';
import { waitForViewerSurfaceCommit } from './controller';

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-08-27T00:00:00.000Z',
    id: 'snapshot-1',
    paths: {
      computedStyles: 'computed.json',
      domSnapshot: 'dom.html',
      errors: 'errors.log',
      manifest: 'manifest.json',
      screenshot: 'screenshot.png',
      snapshotHtml: 'index.html',
      stylesheets: 'stylesheets.json',
      virtualDomSnapshot: 'virtual.html',
    },
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Wide page', url: 'https://example.test' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    viewport: { height: 1440, width: 2560 },
    warnings: [],
  };
}

function setLayoutSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: height },
    clientWidth: { configurable: true, value: width },
  });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('confirms the captured layout viewport even when display zoom transforms its rendered rect', async () => {
  const container = document.createElement('div');
  const iframe = document.createElement('iframe');
  container.style.height = '1440px';
  container.style.width = '2560px';
  container.style.transform = 'scale(0.4)';
  container.appendChild(iframe);
  document.body.appendChild(container);
  setLayoutSize(container, 2560, 1440);
  setLayoutSize(iframe, 2560, 1440);
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    bottom: 576,
    height: 576,
    left: 0,
    right: 1024,
    toJSON: () => ({}),
    top: 0,
    width: 1024,
    x: 0,
    y: 0,
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect() {}
      observe() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  await expect(
    waitForViewerSurfaceCommit({
      command: { type: PREPARATION_SURFACE_RESIZE, viewport: null },
      iframe,
      manifest: createManifest(),
    })
  ).resolves.toBeUndefined();
});
