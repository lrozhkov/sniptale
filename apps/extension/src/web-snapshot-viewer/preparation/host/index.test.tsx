// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { SnapshotPreparationHost } from '.';

const mocks = vi.hoisted(() => ({
  createViewerPreparationRoot: vi.fn(),
  disposeViewerPreparationRoot: vi.fn(),
  ViewerPreparationRuntime: vi.fn(
    (props: { iframe: HTMLIFrameElement | null; manifest: WebSnapshotManifest }) => (
      <div
        data-testid="viewer-preparation-runtime"
        data-has-iframe={props.iframe ? 'true' : 'false'}
      />
    )
  ),
}));

vi.mock('./root', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./root')>()),
  createViewerPreparationRoot: mocks.createViewerPreparationRoot,
  disposeViewerPreparationRoot: mocks.disposeViewerPreparationRoot,
}));

vi.mock('../runtime', () => ({
  ViewerPreparationRuntime: mocks.ViewerPreparationRuntime,
}));

let container: HTMLDivElement | null = null;
let portalContainer: HTMLDivElement | null = null;
let iframe: HTMLIFrameElement | null = null;
let root: Root | null = null;

function createManifest(): WebSnapshotManifest {
  return {
    capturedAt: '2026-05-13T00:00:00.000Z',
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    id: 'snapshot-1',
    paths: {
      computedStyles: 'snapshot/computed-styles.css',
      domSnapshot: 'snapshot/dom.json',
      errors: 'snapshot/errors.json',
      manifest: 'manifest.json',
      screenshot: 'screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'snapshot/stylesheets.css',
      virtualDomSnapshot: 'snapshot/virtual-dom.json',
    },
    schemaVersion: 1,
    source: {
      faviconUrl: null,
      title: 'Saved Snapshot',
      url: 'https://saved.example/path',
    },
    stats: {
      assetCount: 0,
      failedAssetCount: 0,
      packageSize: 1,
    },
    warnings: [],
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  portalContainer = document.createElement('div');
  iframe = document.createElement('iframe');
  document.body.append(container, portalContainer, iframe);
  root = createRoot(container);
  mocks.createViewerPreparationRoot.mockReturnValue({
    appContainer: portalContainer,
    host: document.createElement('div'),
    ownsHost: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  iframe?.remove();
  portalContainer?.remove();
  container?.remove();
  root = null;
  iframe = null;
  portalContainer = null;
  container = null;
  vi.unstubAllGlobals();
});

it('mounts the viewer preparation runtime inside the content-owned portal root', () => {
  const manifest = createManifest();
  act(() => {
    root?.render(<SnapshotPreparationHost iframe={iframe} manifest={manifest} />);
  });

  expect(mocks.createViewerPreparationRoot).toHaveBeenCalledTimes(1);
  expect(mocks.ViewerPreparationRuntime).toHaveBeenCalledWith(
    expect.objectContaining({ iframe, manifest }),
    undefined
  );
  expect(portalContainer?.querySelector('[data-testid="viewer-preparation-runtime"]')).toBeTruthy();
});

it('disposes the viewer-owned content root on unmount', () => {
  act(() => {
    root?.render(<SnapshotPreparationHost iframe={iframe} manifest={createManifest()} />);
  });
  const createdRoot = mocks.createViewerPreparationRoot.mock.results[0]?.value;

  act(() => root?.unmount());

  expect(mocks.disposeViewerPreparationRoot).toHaveBeenCalledWith(createdRoot);
});
