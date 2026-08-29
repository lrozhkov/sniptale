// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { LoadedWebSnapshotPackage } from '../../viewer/assets';

const mocks = vi.hoisted(() => ({
  blockSnapshotFrameNavigation: vi.fn(),
  browserTabsCreate: vi.fn(),
  latestFrameLoad: null as (() => void) | null,
  loadSettings: vi.fn(),
  loadWebSnapshotPackage: vi.fn(),
  printWebSnapshotProjection: vi.fn(),
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
vi.mock('../../viewer/frame-navigation', () => ({
  blockSnapshotFrameNavigation: mocks.blockSnapshotFrameNavigation,
}));
vi.mock('../../viewer/print-projection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewer/print-projection')>()),
  printWebSnapshotProjection: mocks.printWebSnapshotProjection,
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
  return createPagePackageManifestFixture({
    ...overrides,
    source: overrides.source ?? {
      faviconUrl: null,
      title: 'Page title',
      url: 'https://example.com/page',
    },
  });
}

function createLoadedPackage(args: {
  assets?: LoadedWebSnapshotPackage['assets'];
  html?: string;
  manifest?: Partial<WebSnapshotManifest>;
  objectUrls?: string[];
}): LoadedWebSnapshotPackage {
  return {
    archiveFilename: 'Page_title.sniptale-page-package.zip',
    archiveSize: 5_000_000,
    archiveUrl: 'blob:snapshot-archive',
    assets: args.assets ?? [],
    documentUrl: null,
    html: args.html ?? '<p>Snapshot</p>',
    manifest: createViewerManifest(args.manifest ?? {}),
    objectUrls: args.objectUrls ?? [],
    screenshotCoverage: 'full-page',
    screenshotUrl: 'blob:snapshot-screenshot',
  };
}

async function loadSnapshotIframe(): Promise<HTMLIFrameElement> {
  let iframe = container?.querySelector('iframe');
  if (!iframe) {
    const staticButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === translate('webSnapshotViewer.app.staticDocumentMode', 'en')
    );
    act(() => staticButton?.click());
    iframe = container?.querySelector('iframe');
  }
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
  mocks.printWebSnapshotProjection.mockReset();
  mocks.printWebSnapshotProjection.mockResolvedValue(undefined);
  mocks.loadSettings.mockResolvedValue({ externalSnapshotLinksEnabled: false });
  mocks.browserTabsCreate.mockResolvedValue({});
  document.documentElement.lang = 'en';
  document.title = 'Sniptale Web Snapshot';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.readSnapshotIdFromLocation.mockReturnValue('snapshot-1');
  mocks.useAppLocale.mockReturnValue('en');
  mocks.SnapshotPreparationHost.mockClear();
});

it('opens a projected snapshot link in a new active tab only when the setting is enabled', async () => {
  mocks.loadSettings.mockResolvedValue({ externalSnapshotLinksEnabled: true });
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage({}));

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });
  await loadSnapshotIframe();

  const options = mocks.blockSnapshotFrameNavigation.mock.calls.at(-1)?.[1] as
    | { externalLinksEnabled: boolean; onOpenExternalLink: (href: string) => void }
    | undefined;
  expect(options?.externalLinksEnabled).toBe(true);
  await act(async () => {
    options?.onOpenExternalLink('https://example.test/next');
  });
  expect(mocks.browserTabsCreate).toHaveBeenCalledWith({
    active: true,
    url: 'https://example.test/next',
  });
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
        manifest: {
          source: {
            faviconUrl: null,
            title: 'Page',
            url: 'https://example.com',
          },
        },
        objectUrls: ['blob:late'],
      })
    );
  });

  expect(mocks.revokeWebSnapshotObjectUrls).toHaveBeenCalledWith([]);
  expect(mocks.revokeWebSnapshotObjectUrls).toHaveBeenCalledWith(['blob:late']);
});

it('collapses the whole toolbar and restores it from a compact overlay control', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage({}));

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(document.title).toBe('Page title - Sniptale Web Snapshot');
  expect(container?.textContent).toContain('Page title');
  expect(container?.textContent).toContain('https://example.com/page');
  expect(container?.querySelector('[data-testid="snapshot-metadata"]')?.textContent).toContain(
    '5 MB'
  );
  const metadata = container?.querySelector('[data-testid="snapshot-metadata"]');
  expect(metadata?.parentElement?.children).toHaveLength(2);
  expect(container?.querySelector('main')?.className).toContain('overflow-hidden');
  expect(container?.querySelector('header')?.className).toContain('max-w-full');
  expect(container?.querySelector('header')?.className).toContain('flex-wrap');
  expect(container?.querySelector('header')?.className).not.toContain('overflow-hidden');
  expect(
    container
      ?.querySelector<HTMLAnchorElement>(
        `a[aria-label="${translate('webSnapshotViewer.app.downloadPackage', 'en')}"]`
      )
      ?.getAttribute('href')
  ).toBe('blob:snapshot-archive');

  const collapseButton = container?.querySelector(
    `button[aria-label="${translate('webSnapshotViewer.app.collapseToolbar', 'en')}"]`
  ) as HTMLButtonElement | null;
  expect(collapseButton).toBeTruthy();

  act(() => {
    collapseButton?.click();
  });

  expect(container?.textContent).not.toContain('Page title');
  expect(container?.textContent).not.toContain('https://example.com/page');
  expect(document.title).toBe('Page title - Sniptale Web Snapshot');
  expect(container?.querySelector('header')).toBeNull();
  expect(
    container?.querySelector(`[aria-label="${translate('webSnapshotViewer.app.modeLabel', 'en')}"]`)
  ).toBeNull();
  const expandButton = container?.querySelector(
    `button[aria-label="${translate('webSnapshotViewer.app.expandToolbar', 'en')}"]`
  ) as HTMLButtonElement | null;
  expect(expandButton).toBeTruthy();
  expect(expandButton?.className).toContain('right-6');

  act(() => expandButton?.click());
  expect(container?.textContent).toContain('Page title');
  expect(container?.textContent).toContain('https://example.com/page');

  await loadSnapshotIframe();
  expect(container?.querySelector('iframe')).not.toBeNull();
});

it('prepares the sanitized static document as a PDF projection on explicit action', async () => {
  const loaded = createLoadedPackage({
    manifest: { viewport: { deviceScaleFactor: 1, height: 900, width: 1440 } },
  });
  mocks.loadWebSnapshotPackage.mockResolvedValue(loaded);

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });
  const pdfButton = container?.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('webSnapshotViewer.app.exportPdf', 'en')}"]`
  );
  await act(async () => {
    pdfButton?.click();
  });

  expect(mocks.printWebSnapshotProjection).toHaveBeenCalledWith({
    documentUrl: loaded.documentUrl,
    html: loaded.html,
    viewport: loaded.manifest.viewport,
  });
  expect(pdfButton?.disabled).toBe(false);
});

it('prevents duplicate PDF preparation and surfaces a localized failure', async () => {
  let rejectPrint: (error: Error) => void = () => undefined;
  mocks.printWebSnapshotProjection.mockReturnValue(
    new Promise<void>((_resolve, reject) => {
      rejectPrint = reject;
    })
  );
  mocks.loadWebSnapshotPackage.mockResolvedValue(createLoadedPackage({}));

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });
  const pdfButton = container?.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('webSnapshotViewer.app.exportPdf', 'en')}"]`
  );
  act(() => {
    pdfButton?.click();
    pdfButton?.click();
  });
  expect(mocks.printWebSnapshotProjection).toHaveBeenCalledOnce();
  expect(pdfButton?.disabled).toBe(true);

  await act(async () => rejectPrint(new Error('print failed')));

  expect(pdfButton?.disabled).toBe(false);
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    translate('webSnapshotViewer.app.exportPdfFailed', 'en')
  );
});

it('opens with the static document and switches explicitly to the screenshot', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({
      manifest: { viewport: { deviceScaleFactor: 1, height: 900, width: 1440 } },
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  await loadSnapshotIframe();
  expect(container?.querySelector('[data-testid="snapshot-visual-image"]')).toBeNull();
  expect(container?.querySelector('iframe')).not.toBeNull();

  const screenshotButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === translate('webSnapshotViewer.app.visualMode', 'en')
  );
  act(() => screenshotButton?.click());

  const image = container?.querySelector<HTMLImageElement>('[data-testid="snapshot-visual-image"]');
  expect(image?.src).toBe('blob:snapshot-screenshot');
  expect(image?.style.width).toBe('1024px');
  expect(image?.style.maxWidth).toBe('');
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
  act(() => image?.dispatchEvent(new Event('load')));
  expect(image?.style.width).toBe('711.1111111111111px');
  expect(container?.querySelector('iframe')).toBeNull();
});

it('shows verified nested assets without replacing the static-document default', async () => {
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({
      assets: [
        {
          downloadUrl: 'blob:image-download',
          mimeType: 'image/png',
          path: 'assets/1.png',
          size: 2048,
          url: 'blob:image',
        },
        {
          downloadUrl: 'blob:style-download',
          mimeType: 'text/css',
          path: 'assets/2.css',
          size: 512,
          url: 'blob:style',
        },
      ],
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });
  expect(container?.querySelector('iframe')).not.toBeNull();
  expect(container?.querySelector('[data-testid="snapshot-asset-catalog"]')).toBeNull();

  const assetsButton = Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === translate('webSnapshotViewer.app.assetsMode', 'en')
  );
  act(() => assetsButton?.click());

  expect(container?.querySelector('[data-testid="snapshot-asset-catalog"]')).not.toBeNull();
  expect(container?.querySelector<HTMLImageElement>('img[src="blob:image"]')).not.toBeNull();
  expect(container?.textContent).toContain('1.png');
  expect(container?.textContent).toContain('2.css');
  expect(container?.querySelector('iframe')).toBeNull();
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
      manifest: {
        source: {
          faviconUrl: null,
          title: 'Example',
          url: 'https://example.com/page',
        },
      },
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
      manifest: {
        source: {
          faviconUrl: null,
          title: '',
          url: 'https://example.com/page',
        },
      },
    })
  );

  await act(async () => {
    root?.render(<WebSnapshotViewerApp />);
  });

  expect(document.title).toBe('Sniptale Веб-снимок');
  expect(document.documentElement.lang).toBe('ru');
  expect(container?.textContent).toContain('Sniptale Веб-снимок');
  expect(container?.textContent).toContain('https://example.com/page');
  await loadSnapshotIframe();
  expect(container?.querySelector('iframe')?.getAttribute('title')).toBe('Веб-снимок');
});

it('sets Russian document title from source title plus localized product suffix', async () => {
  mocks.useAppLocale.mockReturnValue('ru');
  mocks.loadWebSnapshotPackage.mockResolvedValue(
    createLoadedPackage({
      manifest: {
        source: {
          faviconUrl: null,
          title: 'Пример',
          url: 'https://example.com/page',
        },
      },
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
