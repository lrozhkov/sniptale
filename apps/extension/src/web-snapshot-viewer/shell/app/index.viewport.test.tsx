// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { translate } from '../../../platform/i18n';
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
    extractPackageFile: vi.fn(async () => new Blob(['file'])),
    html: '<p>Snapshot</p>',
    manifest: createViewerManifest(manifest),
    objectUrls: [],
    packageFiles: [],
    screenshotCoverage: 'full-page',
    screenshotFilename: 'Page_title.png',
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

it('reflows the saved static document at the available viewer dimensions in fit mode', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 2, height: 1440, width: 2560 } })
  );

  await renderViewer();

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.width).toBe('1024px');
  expect(viewport?.style.height).toBe('768px');
  const scaledViewport = container?.querySelector<HTMLElement>(
    '[data-testid="snapshot-frame-scaled-viewport"]'
  );
  expect(scaledViewport?.style.width).toBe('1024px');
  expect(scaledViewport?.style.height).toBe('768px');
  expect(viewport?.style.transform).toBe('scale(1)');
});

it('reflows a near-width static document at a sharp 100% scale', async () => {
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

  expect(scaledViewport?.style.width).toBe('1024px');
  expect(viewport?.style.transform).toBe('scale(1)');
  expect(actualSizeButton).toBeDefined();
});

it('does not expose horizontal scrolling caused only by the vertical scrollbar gutter', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 1, height: 800, width: 1030 } })
  );

  await renderViewer();
  const surface = container?.querySelector<HTMLElement>('[data-testid="snapshot-viewer-surface"]');
  Object.defineProperties(surface!, {
    clientWidth: { configurable: true, value: 1020 },
    offsetWidth: { configurable: true, value: 1030 },
  });
  act(() => window.dispatchEvent(new Event('resize')));

  const viewport = container?.querySelector<HTMLElement>('[data-testid="snapshot-frame-viewport"]');
  expect(viewport?.style.transform).toBe('scale(1)');
  expect(surface?.className).toContain('overflow-x-hidden');
  expect(surface?.className).toContain('overflow-y-auto');
});

it('does not let grab navigation consume the collapsed toolbar button pointer gesture', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 1, height: 800, width: 1030 } })
  );

  await renderViewer();
  const collapseButton = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => button.querySelector('.lucide-panel-top-close') !== null
  );
  expect(collapseButton).toBeTruthy();
  act(() => collapseButton?.click());
  const expandButton = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => button.querySelector('.lucide-panel-top-open') !== null
  );
  expect(expandButton).toBeTruthy();
  const surface = container?.querySelector<HTMLElement>('[data-testid="snapshot-viewer-surface"]');
  Object.defineProperties(surface!, {
    clientHeight: { configurable: true, value: 700 },
    clientWidth: { configurable: true, value: 1020 },
    scrollHeight: { configurable: true, value: 800 },
    scrollWidth: { configurable: true, value: 1030 },
  });
  const pointerDown = new MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });

  act(() => expandButton?.dispatchEvent(pointerDown));
  expect(pointerDown.defaultPrevented).toBe(false);
  act(() => expandButton?.click());
  expect(container?.querySelector('header')).not.toBeNull();
});

it('uses browser-like zoom without returning the static document to its captured viewbox', async () => {
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
  expect(viewport()?.style.width).toBe('1024px');
  expect(viewport()?.style.height).toBe('768px');
  expect(scaledViewport()?.style.height).toBe('768px');

  const percentButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === '100%'
  );
  const surface = container?.querySelector<HTMLElement>('[data-testid="snapshot-viewer-surface"]');
  expect(surface?.className).toContain('overflow-x-hidden');
  expect(surface?.className).toContain('overflow-y-auto');
  expect(surface?.style.scrollbarGutter).toBe('stable');
  expect(surface?.className).not.toContain('cursor-grab');

  const zoomButtons = percentButton?.parentElement?.querySelectorAll('button');
  expect(zoomButtons).toHaveLength(3);
  act(() => {
    zoomButtons?.item(2).click();
  });
  expect(scaledViewport()?.style.width).toBe('1024px');
  expect(scaledViewport()?.style.height).toBe('768px');
  expect(viewport()?.style.width).toBe('931px');
  expect(viewport()?.style.height).toBe('699px');
  expect(viewport()?.style.transform).toBe('scale(1.1)');
  expect(percentButton?.textContent).toBe('110%');

  act(() => {
    zoomButtons?.item(0).click();
  });
  expect(viewport()?.style.width).toBe('1024px');
  expect(viewport()?.style.transform).toBe('scale(1)');
  expect(percentButton?.textContent).toBe('100%');

  act(() => {
    zoomButtons?.item(0).click();
  });
  expect(scaledViewport()?.style.width).toBe('1024px');
  expect(viewport()?.style.width).toBe('1138px');
  expect(viewport()?.style.height).toBe('854px');
  expect(viewport()?.style.transform).toBe('scale(0.9)');
  expect(percentButton?.textContent).toBe('90%');
});

it('pans an enlarged snapshot with primary-button grab navigation', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({ viewport: { deviceScaleFactor: 2, height: 1440, width: 2560 } })
  );
  await renderViewer();
  const visualModeLabels = [
    translate('webSnapshotViewer.app.visualMode', 'en'),
    translate('webSnapshotViewer.app.visualMode', 'ru'),
  ];
  const visualModeButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    visualModeLabels.includes(button.textContent ?? '')
  );
  expect(visualModeButton).toBeDefined();
  act(() => visualModeButton?.click());
  const percentButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === '40%'
  );
  expect(percentButton).toBeDefined();
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
