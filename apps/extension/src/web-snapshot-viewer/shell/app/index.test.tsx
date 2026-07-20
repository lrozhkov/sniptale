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
  revokeWebSnapshotObjectUrls: vi.fn(),
  useAppLocale: vi.fn(() => 'en'),
  SnapshotPreparationHost: vi.fn(
    (props: {
      iframe: HTMLIFrameElement | null;
      onViewportChange?: (viewport: { width: number; height: number } | null) => void;
    }) => (
      <button
        type="button"
        data-has-iframe={props.iframe ? 'true' : 'false'}
        data-testid="mock-viewport-change"
        onClick={() => props.onViewportChange?.({ width: 390, height: 844 })}
      />
    )
  ),
}));

vi.mock('./route', () => ({
  readSnapshotIdFromLocation: mocks.readSnapshotIdFromLocation,
}));
vi.mock('../../viewer/frame-navigation', () => ({ blockSnapshotFrameNavigation: vi.fn() }));
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
  revokeWebSnapshotObjectUrls: mocks.revokeWebSnapshotObjectUrls,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: mocks.useAppLocale,
  };
});

import { WebSnapshotViewerApp } from '.';
import { translate } from '../../../platform/i18n';

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
    stats: {
      assetCount: 0,
      failedAssetCount: 0,
      packageSize: 0,
      ...stats,
    },
    warnings: [],
    ...rootOverrides,
  };
}

function createLoadedPackage(args: {
  html?: string;
  manifest?: Partial<WebSnapshotManifest>;
  objectUrls?: string[];
}): LoadedWebSnapshotPackage {
  return {
    html: args.html ?? '<p>Snapshot</p>',
    manifest: createViewerManifest(args.manifest ?? {}),
    objectUrls: args.objectUrls ?? [],
  };
}

async function loadSnapshotIframe(): Promise<HTMLIFrameElement> {
  const iframe = container?.querySelector('iframe');
  if (!iframe) {
    throw new Error('Expected snapshot iframe.');
  }

  await act(async () => {
    mocks.latestFrameLoad?.();
  });

  return iframe;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.latestFrameLoad = null;
  mocks.loadWebSnapshotPackage.mockReset();
  document.documentElement.lang = 'en';
  document.title = 'Sniptale Web Snapshot';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.readSnapshotIdFromLocation.mockReturnValue('snapshot-1');
  mocks.useAppLocale.mockReturnValue('en');
  mocks.SnapshotPreparationHost.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it('revokes object URLs from a snapshot load that resolves after unmount', async () => {
  let resolveLoad: (loaded: LoadedWebSnapshotPackage) => void = () => undefined;
  mocks.loadWebSnapshotPackage.mockReturnValue(
    new Promise<LoadedWebSnapshotPackage>((resolve) => {
      resolveLoad = resolve;
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });
  act(() => root?.unmount());

  await act(async () => {
    resolveLoad(
      createLoadedPackage({
        manifest: { source: { faviconUrl: null, title: 'Page', url: 'https://example.com' } },
        objectUrls: ['blob:late'],
      })
    );
  });

  expect(mocks.revokeWebSnapshotObjectUrls).toHaveBeenCalledWith([]);
  expect(mocks.revokeWebSnapshotObjectUrls).toHaveBeenCalledWith(['blob:late']);
});

it('hides the snapshot title bar until the viewer page is refreshed', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage({}));

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(document.title).toBe('Page title - Sniptale Web Snapshot');
  expect(container?.textContent).toContain('Page title');
  expect(container?.textContent).toContain('https://example.com/page');

  const closeButton = container?.querySelector(
    `button[aria-label="${translate('webSnapshotViewer.app.hideHeader', 'en')}"]`
  ) as HTMLButtonElement | null;
  expect(closeButton).toBeTruthy();

  act(() => {
    closeButton?.click();
  });

  expect(container?.textContent).not.toContain('Page title');
  expect(container?.textContent).not.toContain('https://example.com/page');
  expect(document.title).toBe('Page title - Sniptale Web Snapshot');
});

it('mounts preparation only after the current snapshot iframe load event', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage({}));

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(mocks.SnapshotPreparationHost).not.toHaveBeenCalled();

  const iframe = await loadSnapshotIframe();

  expect(mocks.SnapshotPreparationHost).toHaveBeenCalledWith(
    expect.objectContaining({ iframe }),
    undefined
  );
  expect(
    container
      ?.querySelector('[data-testid="mock-viewport-change"]')
      ?.getAttribute('data-has-iframe')
  ).toBe('true');
});

it('invalidates viewer preparation readiness across viewer remounts', async () => {
  mocks.loadWebSnapshotPackage
    .mockResolvedValueOnce(createLoadedPackage({ html: '<p>First</p>' }))
    .mockResolvedValueOnce(createLoadedPackage({ html: '<p>Second</p>' }));

  await act(async () => {
    root?.render(<WebSnapshotViewerApp key="first" />);
  });
  await loadSnapshotIframe();
  expect(mocks.SnapshotPreparationHost).toHaveBeenCalledTimes(1);

  await act(async () => {
    root?.render(<WebSnapshotViewerApp key="second" />);
  });

  expect(mocks.SnapshotPreparationHost).toHaveBeenCalledTimes(1);
  await loadSnapshotIframe();
  expect(mocks.SnapshotPreparationHost).toHaveBeenCalledTimes(2);
});

it('sets document title from source title plus localized suffix', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({
      manifest: { source: { faviconUrl: null, title: 'Example', url: 'https://example.com/page' } },
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(document.title).toBe('Example - Sniptale Web Snapshot');
  expect(document.documentElement.lang).toBe('en');
});

it('uses localized fallback for missing source titles and keeps source URL visible', async () => {
  mocks.useAppLocale.mockReturnValue('ru');
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({
      manifest: { source: { faviconUrl: null, title: '', url: 'https://example.com/page' } },
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(document.title).toBe('Sniptale Веб-снимок');
  expect(document.documentElement.lang).toBe('ru');
  expect(container?.textContent).toContain('Sniptale Веб-снимок');
  expect(container?.textContent).toContain('https://example.com/page');
  expect(container?.querySelector('iframe')?.getAttribute('title')).toBe('Веб-снимок');
});

it('sets Russian document title from source title plus localized product suffix', async () => {
  mocks.useAppLocale.mockReturnValue('ru');
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({
      manifest: { source: { faviconUrl: null, title: 'Пример', url: 'https://example.com/page' } },
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(document.title).toBe('Пример - Sniptale Веб-снимок');
});

it('resolves the viewer title messages from shared Web Snapshot naming', () => {
  expect(translate('webSnapshotViewer.app.documentTitleFallback', 'ru')).toBe(
    'Sniptale Веб-снимок'
  );
  expect(translate('webSnapshotViewer.app.documentTitleSuffix', 'ru')).toBe('Sniptale Веб-снимок');
  expect(translate('webSnapshotViewer.app.documentTitleFallback', 'en')).toBe(
    'Sniptale Web Snapshot'
  );
});
