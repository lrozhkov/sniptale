// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  getStorageCleanupReportMock,
  loadGalleryLibrarySnapshotMock,
  subscribeToMediaHubEventsMock,
} = vi.hoisted(() => ({
  getStorageCleanupReportMock: vi.fn(),
  loadGalleryLibrarySnapshotMock: vi.fn(),
  subscribeToMediaHubEventsMock: vi.fn(),
}));

vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/events')>()),
  subscribeToMediaHubEvents: subscribeToMediaHubEventsMock,
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  getStorageCleanupReport: getStorageCleanupReportMock,
}));

vi.mock('./use-gallery-library-snapshot', () => ({
  loadGalleryLibrarySnapshot: loadGalleryLibrarySnapshotMock,
}));

import { useGalleryLibraryState } from './useGalleryLibraryState';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  loadGalleryLibrarySnapshotMock.mockResolvedValue({
    estimate: { usage: 10, quota: 20 },
    nextItems: [{ id: 'asset-1' }],
  });
  getStorageCleanupReportMock.mockResolvedValue({ groups: [] });
  subscribeToMediaHubEventsMock.mockImplementation((handler) => {
    (subscribeToMediaHubEventsMock as unknown as { handler?: typeof handler }).handler = handler;
    return () => undefined;
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function renderConnectedProbe(
  values: Array<ReturnType<typeof useGalleryLibraryState>>,
  handlers: {
    onBanner: (message: string) => void;
    onPreviewItemRefresh: (items: Array<{ id: string }>) => void;
    onSelectionRefresh: (items: Array<{ id: string }>) => void;
    onStorageManagerOpen: () => void;
  }
) {
  function ConnectedProbe() {
    values.push(
      useGalleryLibraryState({
        onBanner: handlers.onBanner,
        onPreviewItemRefresh: handlers.onPreviewItemRefresh,
        onSelectionRefresh: handlers.onSelectionRefresh,
        onStorageManagerOpen: handlers.onStorageManagerOpen,
      })
    );
    return null;
  }

  act(() => {
    root?.render(<ConnectedProbe />);
  });
}

async function flushLibraryState() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createSnapshotDeferred(nextItems: Array<{ id: string }>) {
  let resolve: () => void = () => undefined;
  const promise = new Promise<{
    estimate: { quota: number; usage: number };
    nextItems: Array<{ id: string }>;
  }>((promiseResolve) => {
    resolve = () => promiseResolve({ estimate: { usage: 10, quota: 20 }, nextItems });
  });
  return { promise, resolve };
}

function createCleanupReportDeferred(potentialBytes: number) {
  let resolve: () => void = () => undefined;
  const promise = new Promise<{ groups: []; potentialBytes: number }>((promiseResolve) => {
    resolve = () => promiseResolve({ groups: [], potentialBytes });
  });
  return { promise, resolve };
}

it('loads library state and reacts to media-hub events', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onBanner = vi.fn<(message: string) => void>();
  const onPreviewItemRefresh = vi.fn<(items: Array<{ id: string }>) => void>();
  const onSelectionRefresh = vi.fn<(items: Array<{ id: string }>) => void>();
  const onStorageManagerOpen = vi.fn<() => void>();

  renderConnectedProbe(values, {
    onBanner,
    onPreviewItemRefresh,
    onSelectionRefresh,
    onStorageManagerOpen,
  });
  await flushLibraryState();

  expect(values.at(-1)?.items).toEqual([{ id: 'asset-1' }]);
  expect(loadGalleryLibrarySnapshotMock).toHaveBeenCalled();
  expect(onPreviewItemRefresh).toHaveBeenCalledWith([{ id: 'asset-1' }]);
  expect(onSelectionRefresh).toHaveBeenCalledWith([{ id: 'asset-1' }]);

  const handler = (
    subscribeToMediaHubEventsMock as unknown as {
      handler: (event: { type: string; message: string }) => void;
    }
  ).handler;
  act(() => {
    handler({ type: 'library-changed', message: 'updated' });
    handler({ type: 'storage-warning', message: 'warning' });
  });
  await flushLibraryState();

  expect(onBanner).toHaveBeenCalledWith('warning');
  expect(onStorageManagerOpen).toHaveBeenCalled();
});

it('tolerates cleanup-report failures', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
    onStorageManagerOpen: vi.fn(),
  });
  await flushLibraryState();

  getStorageCleanupReportMock.mockRejectedValueOnce(new Error('fail'));
  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
    onStorageManagerOpen: vi.fn(),
  });
  await flushLibraryState();
});

it('reports library refresh failures through the gallery banner without throwing', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onBanner = vi.fn<(message: string) => void>();

  loadGalleryLibrarySnapshotMock.mockRejectedValueOnce(new Error('snapshot failed'));

  renderConnectedProbe(values, {
    onBanner,
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
    onStorageManagerOpen: vi.fn(),
  });
  await flushLibraryState();

  expect(values.at(-1)?.isLoading).toBe(false);
  expect(values.at(-1)?.items).toEqual([]);
  expect(onBanner).toHaveBeenCalledWith(expect.any(String));
});

it('ignores stale refresh results that complete after a newer library snapshot', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const firstRefresh = createSnapshotDeferred([{ id: 'stale-asset' }]);
  const secondRefresh = createSnapshotDeferred([{ id: 'fresh-asset' }]);

  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
    onStorageManagerOpen: vi.fn(),
  });
  await flushLibraryState();

  loadGalleryLibrarySnapshotMock
    .mockReturnValueOnce(firstRefresh.promise)
    .mockReturnValueOnce(secondRefresh.promise);

  act(() => {
    void values.at(-1)?.refresh();
    void values.at(-1)?.refresh();
  });

  await act(async () => secondRefresh.resolve());
  expect(values.at(-1)?.items).toEqual([{ id: 'fresh-asset' }]);

  await act(async () => firstRefresh.resolve());
  expect(values.at(-1)?.items).toEqual([{ id: 'fresh-asset' }]);
});

it('keeps gallery items stable when a background refresh returns an equivalent snapshot', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onPreviewItemRefresh = vi.fn<(items: Array<{ id: string }>) => void>();
  const onSelectionRefresh = vi.fn<(items: Array<{ id: string }>) => void>();

  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh,
    onSelectionRefresh,
    onStorageManagerOpen: vi.fn(),
  });
  await flushLibraryState();

  const initialItems = values.at(-1)?.items;
  loadGalleryLibrarySnapshotMock.mockResolvedValueOnce({
    estimate: { usage: 10, quota: 20 },
    nextItems: [{ id: 'asset-1' }],
  });

  await act(async () => {
    await values.at(-1)?.refresh();
  });

  expect(values.at(-1)?.items).toBe(initialItems);
  expect(onPreviewItemRefresh).toHaveBeenCalledTimes(1);
  expect(onSelectionRefresh).toHaveBeenCalledTimes(1);
});

it('ignores stale cleanup-report results that complete after a newer report', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const staleReport = createCleanupReportDeferred(1);
  const freshReport = createCleanupReportDeferred(2);

  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
    onStorageManagerOpen: vi.fn(),
  });
  await flushLibraryState();

  getStorageCleanupReportMock
    .mockReturnValueOnce(staleReport.promise)
    .mockReturnValueOnce(freshReport.promise);

  await act(async () => {
    await values.at(-1)?.refresh();
  });
  await act(async () => {
    await values.at(-1)?.refresh();
  });

  await act(async () => freshReport.resolve());
  expect(values.at(-1)?.cleanupReport?.potentialBytes).toBe(2);

  await act(async () => staleReport.resolve());
  expect(values.at(-1)?.cleanupReport?.potentialBytes).toBe(2);
});
