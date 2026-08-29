// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';

const mocks = vi.hoisted(() => ({
  browserTabsCreate: vi.fn(),
  latestFrameLoad: null as (() => void) | null,
  loadSettings: vi.fn(),
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
vi.mock('../../../composition/persistence/settings', () => ({
  loadSettings: mocks.loadSettings,
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: mocks.browserTabsCreate },
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
  return createPagePackageManifestFixture({
    ...overrides,
    source: overrides.source ?? {
      faviconUrl: null,
      title: 'Page title',
      url: 'https://example.com/page',
    },
  });
}

function createLoadedPackage(
  manifest: Partial<WebSnapshotManifest> = {}
): LoadedWebSnapshotPackage {
  return {
    archiveFilename: 'Page_title.sniptale-page-package.zip',
    archiveSize: 5_000_000,
    archiveUrl: 'blob:snapshot-archive',
    assets: [],
    documentUrl: null,
    html: '<p>Snapshot</p>',
    manifest: createViewerManifest(manifest),
    objectUrls: [],
    screenshotCoverage: 'full-page',
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
  mocks.loadSettings.mockResolvedValue({ externalSnapshotLinksEnabled: false });
  mocks.browserTabsCreate.mockResolvedValue({});
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

it('keeps the saved width and expands a reduced default viewport downward', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 2, height: 1440, width: 2560 } })
  );

  await renderViewer();

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.width).toBe('2560px');
  expect(viewport?.style.height).toBe('1920px');
  const scaledViewport = container?.querySelector<HTMLElement>(
    '[data-testid="snapshot-frame-scaled-viewport"]'
  );
  expect(scaledViewport?.style.width).toBe('1024px');
  expect(scaledViewport?.style.height).toBe('768px');
  expect(viewport?.style.transform).toBe('scale(0.4)');
});

it('uses a true 100% scale instead of blurring a near-width capture by a few pixels', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 1, height: 800, width: 1030 } })
  );

  await renderViewer();

  const scaledViewport = container?.querySelector<HTMLElement>(
    '[data-testid="snapshot-frame-scaled-viewport"]'
  );
  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  const actualSizeButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === '100%'
  );

  expect(scaledViewport?.style.width).toBe('1030px');
  expect(viewport?.style.transform).toBe('scale(1)');
  expect(actualSizeButton).toBeDefined();
});

it('keeps captured layout dimensions while switching between fit and manual zoom', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 2, height: 1440, width: 2560 } })
  );

  await renderViewer();

  const scaledViewport = () =>
    container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-scaled-viewport"]');
  const viewport = () =>
    container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(scaledViewport()?.style.width).toBe('1024px');
  expect(scaledViewport()?.className).toContain('overflow-hidden');
  expect(viewport()?.style.width).toBe('2560px');
  expect(viewport()?.style.height).toBe('1920px');
  expect(scaledViewport()?.style.height).toBe('768px');

  const percentButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === '40%'
  );
  act(() => {
    percentButton?.click();
  });
  expect(scaledViewport()?.style.width).toBe('2560px');
  expect(viewport()?.style.transform).toBe('scale(1)');
  expect(viewport()?.style.height).toBe('1440px');
  const surface = container?.querySelector<HTMLElement>('[data-testid="snapshot-viewer-surface"]');
  expect(surface?.className).toContain('overflow-auto');
  expect(surface?.style.scrollbarGutter).toBe('stable');
  expect(surface?.className).toContain('cursor-grab');

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

it('pans an enlarged snapshot with primary-button grab navigation', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 2, height: 1440, width: 2560 } })
  );
  await renderViewer();
  const percentButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === '40%'
  );
  act(() => percentButton?.click());
  const surface = container?.querySelector<HTMLElement>('[data-testid="snapshot-viewer-surface"]');
  Object.defineProperties(surface!, {
    clientHeight: { configurable: true, value: 600 },
    clientWidth: { configurable: true, value: 1024 },
    scrollHeight: { configurable: true, value: 1440 },
    scrollWidth: { configurable: true, value: 2560 },
  });

  act(() => {
    surface?.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 400 })
    );
    surface?.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 350, clientY: 250 })
    );
    surface?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  expect(surface?.scrollLeft).toBe(150);
  expect(surface?.scrollTop).toBe(150);
});

it('keeps the fluid viewer surface for legacy snapshots without viewport metadata', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage());

  await renderViewer();

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.width).toBe('');
  expect(viewport?.style.height).toBe('');
});
