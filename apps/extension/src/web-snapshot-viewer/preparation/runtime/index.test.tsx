// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { FrameData } from '../../../features/highlighter/contracts';
import type { PreparationSurfaceProps } from '../../../content/public/preparation-surface';
import { ViewerPreparationRuntime } from '.';

const runtimeMocks = vi.hoisted(() => ({
  aiPickResolver: vi.fn(),
  createPreparationScenarioAutoClickCaptureTransport: vi.fn(),
  createViewerAiPickSourceResolver: vi.fn(),
  createViewerScenarioAutoClickListenerRegistry: vi.fn(),
  createViewerScenarioCaptureSourceAdapter: vi.fn(),
  createViewerScreenshotCaptureAdapter: vi.fn(),
  listenerRegistry: vi.fn(),
  popupExportHandler: vi.fn(),
  surfaceProps: [] as PreparationSurfaceProps[],
  preparationSurface: vi.fn((props: PreparationSurfaceProps) => {
    runtimeMocks.surfaceProps.push(props);
    return <div data-testid="preparation-surface" />;
  }),
}));

vi.mock('../../../content/public/preparation-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/public/preparation-surface')>()),
  createPreparationScenarioAutoClickCaptureTransport:
    runtimeMocks.createPreparationScenarioAutoClickCaptureTransport,
  PreparationSurface: runtimeMocks.preparationSurface,
}));
vi.mock('../capture/adapter', () => ({
  createViewerScreenshotCaptureAdapter: runtimeMocks.createViewerScreenshotCaptureAdapter,
}));
vi.mock('../export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export')>()),
  useViewerPopupExportHandler: () => runtimeMocks.popupExportHandler,
}));
vi.mock('../port', () => ({
  connectViewerPreparationPort: vi.fn(),
}));
vi.mock('../scenario/descriptors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/descriptors')>()),
  createViewerScenarioCaptureSourceAdapter: runtimeMocks.createViewerScenarioCaptureSourceAdapter,
}));
vi.mock('../scenario/listeners', () => ({
  createViewerScenarioAutoClickListenerRegistry:
    runtimeMocks.createViewerScenarioAutoClickListenerRegistry,
}));
vi.mock('./source', () => ({
  createViewerAiPickSourceResolver: runtimeMocks.createViewerAiPickSourceResolver,
}));

let container: HTMLDivElement | null = null;
let iframe: HTMLIFrameElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  iframe = document.createElement('iframe');
  document.body.append(container, iframe);
  root = createRoot(container);
  runtimeMocks.surfaceProps.length = 0;
  runtimeMocks.createViewerAiPickSourceResolver.mockReturnValue(runtimeMocks.aiPickResolver);
  runtimeMocks.createViewerScenarioAutoClickListenerRegistry.mockReturnValue(
    runtimeMocks.listenerRegistry
  );
});

afterEach(() => {
  act(() => root?.unmount());
  iframe?.remove();
  container?.remove();
  root = null;
  iframe = null;
  container = null;
  vi.unstubAllGlobals();
});

it('builds public preparation surface ports from viewer-owned adapters', () => {
  const manifest = createManifest();
  const onViewportChange = vi.fn();
  const frame: FrameData = { height: 20, id: 'frame-1', width: 10, x: 1, y: 2 };

  renderRuntime(manifest, onViewportChange);
  const surfaceProps = requireSurfaceProps();
  const snapshotTarget = iframe!.contentDocument!.createElement('button');
  const outsideTarget = document.createElement('button');

  expect(surfaceProps.onViewportChange).toBe(onViewportChange);
  expect(surfaceProps.ports.acceptsElement(snapshotTarget)).toBe(true);
  expect(surfaceProps.ports.acceptsElement(outsideTarget)).toBe(false);
  assertCapturePort(surfaceProps, frame);
  assertScenarioPorts(surfaceProps, manifest);
  expect(surfaceProps.ports.resolveAiPickSource).toBe(runtimeMocks.aiPickResolver);
  expect(surfaceProps.ports.onPopupExportRequest).toBe(runtimeMocks.popupExportHandler);
  expect(runtimeMocks.createViewerAiPickSourceResolver).toHaveBeenCalledWith(iframe, manifest);
});

function assertCapturePort(surfaceProps: PreparationSurfaceProps, frame: FrameData): void {
  const frameSource = { getFrames: () => [frame] };
  surfaceProps.ports.createCaptureAdapter(frameSource);
  const captureAdapterArgs = runtimeMocks.createViewerScreenshotCaptureAdapter.mock.calls[0]?.[0];
  expect(captureAdapterArgs).toEqual(
    expect.objectContaining({
      iframe,
      getFrames: expect.any(Function),
    })
  );
  expect(captureAdapterArgs.getFrames()).toEqual([frame]);
}

function assertScenarioPorts(
  surfaceProps: PreparationSurfaceProps,
  manifest: WebSnapshotManifest
): void {
  surfaceProps.ports.createScenarioCaptureSourceAdapter();
  expect(runtimeMocks.createViewerScenarioCaptureSourceAdapter).toHaveBeenCalledWith({
    iframe,
    manifest,
  });

  expect(surfaceProps.ports.createScenarioAutoClickListenerRegistry()).toBe(
    runtimeMocks.listenerRegistry
  );
  expect(runtimeMocks.createViewerScenarioAutoClickListenerRegistry).toHaveBeenCalledWith(iframe);

  expect(surfaceProps.ports.createScenarioAutoClickCaptureTransport).toBe(
    runtimeMocks.createPreparationScenarioAutoClickCaptureTransport
  );
}

function renderRuntime(
  manifest: WebSnapshotManifest,
  onViewportChange: (viewport: { width: number; height: number } | null) => void
): void {
  act(() => {
    root?.render(
      <ViewerPreparationRuntime
        iframe={iframe}
        manifest={manifest}
        onViewportChange={onViewportChange}
      />
    );
  });
}

function requireSurfaceProps(): PreparationSurfaceProps {
  const surfaceProps = runtimeMocks.surfaceProps.at(-1);
  if (!surfaceProps) {
    throw new Error('Expected PreparationSurface props.');
  }
  return surfaceProps;
}

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
