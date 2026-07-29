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
import type { ViewerPreparationCommand } from '../../../workflows/page-preparation';
import { ViewerPreparationRuntime } from '.';

const runtimeMocks = vi.hoisted(() => ({
  aiPickResolver: vi.fn(),
  createPreparationScenarioAutoClickCaptureTransport: vi.fn(),
  connectViewerPreparationPort: vi.fn(),
  createViewerAiPickSourceResolver: vi.fn(),
  createViewerScenarioAutoClickListenerRegistry: vi.fn(),
  createViewerScenarioCaptureSourceAdapter: vi.fn(),
  createViewerScreenshotCaptureAdapter: vi.fn(),
  listenerRegistry: vi.fn(),
  popupExportHandler: vi.fn(),
  waitForViewerSurfaceCommit: vi.fn(),
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
  connectViewerPreparationPort: runtimeMocks.connectViewerPreparationPort,
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
vi.mock('../surface/controller', () => ({
  waitForViewerSurfaceCommit: runtimeMocks.waitForViewerSurfaceCommit,
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

it('mutates viewport presets through the viewer-local iframe owner and rejects window presets', async () => {
  const manifest = createManifest();
  const onViewportChange = vi.fn();
  runtimeMocks.waitForViewerSurfaceCommit.mockResolvedValue(undefined);
  renderRuntime(manifest, onViewportChange);
  const mutateViewport = requireSurfaceProps().ports.mutateViewport;
  if (!mutateViewport) throw new Error('Expected viewer-local viewport mutation port.');

  await mutateViewport({
    height: 720,
    presetId: 'viewport-hd',
    target: 'viewport',
    width: 1280,
  });
  expect(onViewportChange).toHaveBeenCalledWith({ height: 720, width: 1280 });
  expect(runtimeMocks.waitForViewerSurfaceCommit).toHaveBeenCalledWith({
    command: {
      type: 'PREPARATION_SURFACE_RESIZE',
      viewport: {
        height: 720,
        presetId: 'viewport-hd',
        target: 'viewport',
        width: 1280,
      },
    },
    iframe,
    manifest,
  });

  await expect(
    mutateViewport({
      height: 720,
      presetId: 'window-hd',
      target: 'window',
      width: 1280,
    })
  ).rejects.toThrow('unavailable in the snapshot viewer');
});

it('restores the previous local viewport when exact verification fails', async () => {
  const manifest = createManifest();
  const onViewportChange = vi.fn();
  runtimeMocks.waitForViewerSurfaceCommit
    .mockRejectedValueOnce(new Error('verification failed'))
    .mockResolvedValueOnce(undefined);
  renderRuntime(manifest, onViewportChange);
  const mutateViewport = requireSurfaceProps().ports.mutateViewport!;

  await expect(
    mutateViewport({
      height: 720,
      presetId: 'viewport-hd',
      target: 'viewport',
      width: 1280,
    })
  ).rejects.toThrow('verification failed');

  expect(onViewportChange).toHaveBeenNthCalledWith(1, { height: 720, width: 1280 });
  expect(onViewportChange).toHaveBeenNthCalledWith(2, null);
  expect(runtimeMocks.waitForViewerSurfaceCommit).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      command: { type: 'PREPARATION_SURFACE_RESIZE', viewport: null },
    })
  );
});

it('serializes overlapping viewport changes so stale rollback cannot overwrite a newer commit', async () => {
  const manifest = createManifest();
  const onViewportChange = vi.fn();
  let rejectFirst!: (reason: unknown) => void;
  const firstCommit = new Promise<void>((_resolve, reject) => {
    rejectFirst = reject;
  });
  runtimeMocks.waitForViewerSurfaceCommit
    .mockReturnValueOnce(firstCommit)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined);
  renderRuntime(manifest, onViewportChange);
  const ports = requireSurfaceProps().ports;
  const mutateViewport = ports.mutateViewport!;
  const onCommand = vi.fn(async (command: ViewerPreparationCommand) => {
    if ('viewport' in command) {
      onViewportChange(
        command.viewport ? { width: command.viewport.width, height: command.viewport.height } : null
      );
    }
  });
  ports.connectPort(onCommand);
  const handleCommand = runtimeMocks.connectViewerPreparationPort.mock.calls[0]?.[0];
  if (!handleCommand) throw new Error('Expected viewer preparation command handler');

  const first = mutateViewport({
    height: 720,
    presetId: 'viewport-a',
    target: 'viewport',
    width: 1280,
  });
  await Promise.resolve();
  const second = handleCommand({
    type: 'PREPARATION_SURFACE_RESIZE',
    viewport: {
      height: 768,
      presetId: 'viewport-b',
      target: 'viewport',
      width: 1024,
    },
  });
  await Promise.resolve();
  expect(onViewportChange).toHaveBeenCalledTimes(1);

  rejectFirst(new Error('first verification failed'));
  await expect(first).rejects.toThrow('first verification failed');
  await expect(second).resolves.toBeUndefined();

  expect(onViewportChange).toHaveBeenNthCalledWith(2, null);
  expect(onViewportChange).toHaveBeenLastCalledWith({ height: 768, width: 1024 });
});

it('compensates a failed enable command with disable and viewport rollback', async () => {
  const manifest = createManifest();
  runtimeMocks.waitForViewerSurfaceCommit
    .mockRejectedValueOnce(new Error('verification failed'))
    .mockResolvedValueOnce(undefined);
  renderRuntime(manifest, vi.fn());
  const onCommand = vi.fn().mockResolvedValue(undefined);
  requireSurfaceProps().ports.connectPort(onCommand);
  const handleCommand = runtimeMocks.connectViewerPreparationPort.mock.calls[0]?.[0];
  if (!handleCommand) throw new Error('Expected viewer preparation command handler');

  await expect(
    handleCommand({
      type: 'ENABLE_SCREENSHOT_MODE',
      viewport: {
        height: 720,
        presetId: 'viewport-hd',
        target: 'viewport',
        width: 1280,
      },
    })
  ).rejects.toThrow('verification failed');

  expect(onCommand).toHaveBeenNthCalledWith(2, { type: 'DISABLE_SCREENSHOT_MODE' });
  expect(onCommand).toHaveBeenNthCalledWith(3, {
    type: 'PREPARATION_SURFACE_RESIZE',
    viewport: null,
  });
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
