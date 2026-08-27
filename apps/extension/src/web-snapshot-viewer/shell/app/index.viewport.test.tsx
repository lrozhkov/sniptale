// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../features/web-snapshot/manifest';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';

const mocks = vi.hoisted(() => ({
  latestFrameLoad: null as (() => void) | null,
  loadWebSnapshotPackage: vi.fn(),
  readSnapshotIdFromLocation: vi.fn(),
  SnapshotPreparationHost: vi.fn(
    (props: { onViewportChange?: (viewport: { width: number; height: number }) => void }) => (
      <button
        type="button"
        data-testid="mock-viewport-change"
        onClick={() => props.onViewportChange?.({ width: 390, height: 844 })}
      />
    )
  ),
}));

vi.mock('./route', () => ({
  readSnapshotIdFromLocation: mocks.readSnapshotIdFromLocation,
}));
vi.mock('../../viewer/frame-navigation', () => ({
  blockSnapshotFrameNavigation: vi.fn(),
}));
vi.mock('../../preparation/host', () => ({
  SnapshotPreparationHost: mocks.SnapshotPreparationHost,
}));
vi.mock('../../viewer/iframe', () => ({
  WebSnapshotFrame: (props: {
    iframeRef: (node: HTMLIFrameElement | null) => void;
    onLoad: () => void;
    srcDoc: string;
    title: string;
  }) => {
    mocks.latestFrameLoad = props.onLoad;
    return <iframe ref={props.iframeRef} data-srcdoc={props.srcDoc} title={props.title} />;
  },
}));
vi.mock('../../viewer/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewer/assets')>()),
  loadWebSnapshotPackage: mocks.loadWebSnapshotPackage,
  revokeWebSnapshotObjectUrls: vi.fn(),
}));

import { WebSnapshotViewerApp } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createViewerManifest(overrides: Partial<WebSnapshotManifest> = {}): WebSnapshotManifest {
  const { source, stats, ...rootOverrides } = overrides;

  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-06-14T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: {
      faviconUrl: null,
      title: 'Page title',
      url: 'https://example.com/page',
      ...source,
    },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 0, ...stats },
    warnings: [],
    ...rootOverrides,
  };
}

function createLoadedPackage(
  manifest: Partial<WebSnapshotManifest> = {}
): LoadedWebSnapshotPackage {
  return {
    assets: [],
    documentUrl: null,
    html: '<p>Snapshot</p>',
    manifest: createViewerManifest(manifest),
    objectUrls: [],
    screenshotUrl: 'blob:snapshot-screenshot',
  };
}

async function renderViewer(): Promise<void> {
  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });
}

async function loadSnapshotIframe(): Promise<void> {
  if (!container?.querySelector('iframe')) {
    act(() => {
      container?.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')?.click();
    });
  }
  await act(async () => {
    mocks.latestFrameLoad?.();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.latestFrameLoad = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.readSnapshotIdFromLocation.mockReturnValue('snapshot-1');
  mocks.SnapshotPreparationHost.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('resizes the snapshot iframe surface when viewer viewport state changes', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage());

  await renderViewer();
  await loadSnapshotIframe();

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="mock-viewport-change"]')?.click();
  });

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.width).toBe('390px');
  expect(viewport?.style.height).toBe('844px');
});

it('uses the saved capture viewport as the default snapshot iframe surface', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { height: 1440, width: 2560 } })
  );

  await renderViewer();

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.width).toBe('2560px');
  expect(viewport?.style.height).toBe('1440px');
  const scaledViewport = container?.querySelector<HTMLElement>(
    '[data-testid="snapshot-frame-scaled-viewport"]'
  );
  expect(scaledViewport?.style.width).toBe('1024px');
  expect(viewport?.style.transform).toBe('scale(0.4)');
});

it('keeps captured layout dimensions while switching between fit and manual zoom', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { height: 1440, width: 2560 } })
  );

  await renderViewer();

  const scaledViewport = () =>
    container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-scaled-viewport"]');
  const viewport = () =>
    container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(scaledViewport()?.style.width).toBe('1024px');
  expect(viewport()?.style.width).toBe('2560px');

  const percentButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === '40%'
  );
  act(() => {
    percentButton?.click();
  });
  expect(scaledViewport()?.style.width).toBe('2560px');
  expect(viewport()?.style.transform).toBe('scale(1)');
  expect(container?.querySelector('[data-testid="snapshot-viewer-surface"]')?.className).toContain(
    'overflow-auto'
  );

  const zoomButtons = percentButton?.parentElement?.querySelectorAll('button');
  act(() => {
    zoomButtons?.item(2).click();
  });
  expect(scaledViewport()?.style.width).toBe('2816px');
  expect(percentButton?.textContent).toBe('110%');

  act(() => {
    zoomButtons?.item(0).click();
  });
  expect(scaledViewport()?.style.width).toBe('2560px');
  expect(percentButton?.textContent).toBe('100%');

  act(() => {
    zoomButtons?.item(zoomButtons.length - 1).click();
  });
  expect(scaledViewport()?.style.width).toBe('1024px');
  expect(viewport()?.style.transform).toBe('scale(0.4)');
});

it('keeps the fluid viewer surface for legacy snapshots without viewport metadata', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage());

  await renderViewer();

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.width).toBe('');
  expect(viewport?.style.height).toBe('');
});
