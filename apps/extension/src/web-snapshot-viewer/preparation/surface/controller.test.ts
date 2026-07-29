// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { PREPARATION_SURFACE_RESIZE } from '../../../workflows/page-preparation';
import { waitForViewerSurfaceCommit } from './controller';

const observers: TestResizeObserver[] = [];

class TestResizeObserver implements ResizeObserver {
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
}

function createManifest(viewport?: { width: number; height: number }): WebSnapshotManifest {
  return {
    capturedAt: '2026-07-27T00:00:00.000Z',
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
    source: { faviconUrl: null, title: 'Saved snapshot', url: 'https://example.com' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    ...(viewport === undefined ? {} : { viewport }),
    warnings: [],
  };
}

function createCommittedSurface(viewport: { width: number; height: number }): {
  container: HTMLDivElement;
  iframe: HTMLIFrameElement;
} {
  const container = document.createElement('div');
  const iframe = document.createElement('iframe');
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;
  container.appendChild(iframe);
  document.body.appendChild(container);

  const rect = {
    bottom: viewport.height,
    height: viewport.height,
    left: 0,
    right: viewport.width,
    toJSON: () => ({}),
    top: 0,
    width: viewport.width,
    x: 0,
    y: 0,
  };
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect);
  vi.spyOn(iframe, 'getBoundingClientRect').mockReturnValue(rect);
  return { container, iframe };
}

beforeEach(() => {
  observers.length = 0;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
  });
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'ResizeObserver');
});

it('acknowledges an exact viewport only after the committed iframe dimensions are observable', async () => {
  const viewport = { height: 720, width: 1280 };
  const { container, iframe } = createCommittedSurface(viewport);

  await waitForViewerSurfaceCommit({
    command: {
      type: PREPARATION_SURFACE_RESIZE,
      viewport: { ...viewport, presetId: 'system:viewport-hd', target: 'viewport' },
    },
    iframe,
    manifest: createManifest(),
  });

  expect(observers).toHaveLength(1);
  expect(observers[0]?.observe).toHaveBeenCalledWith(iframe);
  expect(observers[0]?.observe).toHaveBeenCalledWith(container);
  expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
});

it('uses the saved manifest viewport for Current size and keeps legacy snapshots fluid', async () => {
  const viewport = { height: 768, width: 1024 };
  const { iframe } = createCommittedSurface(viewport);

  await waitForViewerSurfaceCommit({
    command: { type: PREPARATION_SURFACE_RESIZE, viewport: null },
    iframe,
    manifest: createManifest(viewport),
  });

  const legacyContainer = document.createElement('div');
  const legacyIframe = document.createElement('iframe');
  legacyContainer.appendChild(legacyIframe);
  document.body.appendChild(legacyContainer);
  await waitForViewerSurfaceCommit({
    command: { type: PREPARATION_SURFACE_RESIZE, viewport: null },
    iframe: legacyIframe,
    manifest: createManifest(),
  });

  expect(observers).toHaveLength(2);
});

it('rejects browser-window presets and ignores commands without a surface change', async () => {
  const { iframe } = createCommittedSurface({ height: 720, width: 1280 });

  await expect(
    waitForViewerSurfaceCommit({
      command: {
        type: PREPARATION_SURFACE_RESIZE,
        viewport: { height: 720, presetId: 'system:window-hd', target: 'window', width: 1280 },
      },
      iframe,
      manifest: createManifest(),
    })
  ).rejects.toThrow('Browser-window presets are unavailable');

  await expect(
    waitForViewerSurfaceCommit({
      command: { type: MessageType.DISABLE_SCREENSHOT_MODE },
      iframe: null,
      manifest: createManifest(),
    })
  ).resolves.toBeUndefined();
});
