// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioExportItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../library/test-support/items';
import type { GalleryItem } from '../library/items';

const { loadGalleryLibrarySnapshotMock, subscribeToMediaHubEventsMock } = vi.hoisted(() => ({
  loadGalleryLibrarySnapshotMock: vi.fn(),
  subscribeToMediaHubEventsMock: vi.fn(),
}));

vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/events')>()),
  subscribeToMediaHubEvents: subscribeToMediaHubEventsMock,
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
    nextItems: [createMediaItem({ id: 'asset-1' })],
  });
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
  }
) {
  function ConnectedProbe() {
    values.push(
      useGalleryLibraryState({
        onBanner: handlers.onBanner,
        onPreviewItemRefresh: handlers.onPreviewItemRefresh,
        onSelectionRefresh: handlers.onSelectionRefresh,
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

function createSnapshotDeferred(nextItems: GalleryItem[]) {
  let resolve: () => void = () => undefined;
  const promise = new Promise<{
    estimate: { quota: number; usage: number };
    nextItems: GalleryItem[];
  }>((promiseResolve) => {
    resolve = () => promiseResolve({ estimate: { usage: 10, quota: 20 }, nextItems });
  });
  return { promise, resolve };
}

it('loads library state and reacts to media-hub events', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onBanner = vi.fn<(message: string) => void>();
  const onPreviewItemRefresh = vi.fn<(items: Array<{ id: string }>) => void>();
  const onSelectionRefresh = vi.fn<(items: Array<{ id: string }>) => void>();

  renderConnectedProbe(values, {
    onBanner,
    onPreviewItemRefresh,
    onSelectionRefresh,
  });
  await flushLibraryState();

  expect(values.at(-1)?.items).toEqual([expect.objectContaining({ id: 'asset-1' })]);
  expect(loadGalleryLibrarySnapshotMock).toHaveBeenCalled();
  expect(onPreviewItemRefresh).toHaveBeenCalledWith([expect.objectContaining({ id: 'asset-1' })]);
  expect(onSelectionRefresh).toHaveBeenCalledWith([expect.objectContaining({ id: 'asset-1' })]);

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
});

it('reports library refresh failures through the gallery banner without throwing', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onBanner = vi.fn<(message: string) => void>();

  loadGalleryLibrarySnapshotMock.mockRejectedValueOnce(new Error('snapshot failed'));

  renderConnectedProbe(values, {
    onBanner,
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
  });
  await flushLibraryState();

  expect(values.at(-1)?.isLoading).toBe(false);
  expect(values.at(-1)?.items).toEqual([]);
  expect(onBanner).toHaveBeenCalledWith(expect.any(String));
});

it('ignores stale refresh results that complete after a newer library snapshot', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const firstRefresh = createSnapshotDeferred([createMediaItem({ id: 'stale-asset' })]);
  const secondRefresh = createSnapshotDeferred([createMediaItem({ id: 'fresh-asset' })]);

  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh: vi.fn(),
    onSelectionRefresh: vi.fn(),
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
  expect(values.at(-1)?.items).toEqual([expect.objectContaining({ id: 'fresh-asset' })]);

  await act(async () => firstRefresh.resolve());
  expect(values.at(-1)?.items).toEqual([expect.objectContaining({ id: 'fresh-asset' })]);
});

it('keeps gallery items stable when a background refresh returns an equivalent snapshot', async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onPreviewItemRefresh = vi.fn<(items: Array<{ id: string }>) => void>();
  const onSelectionRefresh = vi.fn<(items: Array<{ id: string }>) => void>();

  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh,
    onSelectionRefresh,
  });
  await flushLibraryState();

  const initialItems = values.at(-1)?.items;
  loadGalleryLibrarySnapshotMock.mockResolvedValueOnce({
    estimate: { usage: 10, quota: 20 },
    nextItems: [createMediaItem({ id: 'asset-1' })],
  });

  await act(async () => {
    await values.at(-1)?.refresh();
  });

  expect(values.at(-1)?.items).toBe(initialItems);
  expect(onPreviewItemRefresh).toHaveBeenCalledTimes(1);
  expect(onSelectionRefresh).toHaveBeenCalledTimes(1);
});

async function verifyUiSignificantItemChange(initial: GalleryItem, changed: GalleryItem) {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onPreviewItemRefresh = vi.fn();
  const onSelectionRefresh = vi.fn();
  loadGalleryLibrarySnapshotMock.mockResolvedValueOnce({
    estimate: { usage: 10, quota: 20 },
    nextItems: [initial],
  });
  renderConnectedProbe(values, {
    onBanner: vi.fn(),
    onPreviewItemRefresh,
    onSelectionRefresh,
  });
  await flushLibraryState();
  const initialItems = values.at(-1)?.items;

  loadGalleryLibrarySnapshotMock.mockResolvedValueOnce({
    estimate: { usage: 10, quota: 20 },
    nextItems: [changed],
  });
  await act(async () => values.at(-1)?.refresh());

  expect(values.at(-1)?.items).not.toBe(initialItems);
  expect(onPreviewItemRefresh).toHaveBeenCalledTimes(2);
  expect(onSelectionRefresh).toHaveBeenCalledTimes(2);
}

function createScenarioItemWithProjectUpdatedAt(updatedAt: number) {
  const item = createScenarioItem();
  return createScenarioItem({ project: { ...item.project, updatedAt } });
}

it.each([
  [
    'media content state',
    createMediaItem({ imageContentState: 'original' }),
    createMediaItem({ imageContentState: 'edited' }),
  ],
  [
    'media source identity',
    createMediaItem({ source: { kind: 'recording', recordingId: 'recording-1' } }),
    createMediaItem({ source: { kind: 'recording', recordingId: 'recording-2' } }),
  ],
  [
    'project export source identity',
    createMediaItem({
      source: { kind: 'project-export', exportId: 'export-1', projectId: 'project-1' },
    }),
    createMediaItem({
      source: { kind: 'project-export', exportId: 'export-2', projectId: 'project-1' },
    }),
  ],
  [
    'recording group presentation',
    createMediaItem({
      recordingGroupView: {
        groupId: 'group-1',
        memberCount: 2,
        order: 0,
        projectId: 'project-1',
        projectName: 'Before',
        role: 'display',
        sourceLabel: 'Display',
      },
    }),
    createMediaItem({
      recordingGroupView: {
        groupId: 'group-1',
        memberCount: 2,
        order: 0,
        projectId: 'project-1',
        projectName: 'After',
        role: 'display',
        sourceLabel: 'Display',
      },
    }),
  ],
  ['tag projection', createMediaItem({ tags: ['before'] }), createMediaItem({ tags: ['after'] })],
  [
    'lifecycle projection',
    createMediaItem({ lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 1 } }),
    createMediaItem({ lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 } }),
  ],
  [
    'scenario project revision',
    createScenarioItemWithProjectUpdatedAt(1),
    createScenarioItemWithProjectUpdatedAt(2),
  ],
  [
    'scenario export format',
    createScenarioExportItem({ format: 'html' }),
    createScenarioExportItem({ format: 'markdown' }),
  ],
  [
    'video project availability',
    createVideoProjectItem({ unavailableReason: null }),
    createVideoProjectItem({ unavailableReason: 'invalid' }),
  ],
] as const)('refreshes selection and preview for a changed %s', async (_name, initial, changed) => {
  await verifyUiSignificantItemChange(initial, changed);
});

it("does not traverse an equivalent item's unrelated large nested graph", async () => {
  const values: Array<ReturnType<typeof useGalleryLibraryState>> = [];
  const onBanner = vi.fn();
  const onPreviewItemRefresh = vi.fn();
  const createItemWithUnrelatedGraph = () => {
    const item = createMediaItem();
    Object.defineProperty(item, 'unrelatedLargeGraph', {
      enumerable: true,
      get: () => {
        throw new Error('unrelated graph was traversed');
      },
    });
    return item;
  };
  loadGalleryLibrarySnapshotMock.mockResolvedValueOnce({
    estimate: { usage: 10, quota: 20 },
    nextItems: [createItemWithUnrelatedGraph()],
  });
  renderConnectedProbe(values, {
    onBanner,
    onPreviewItemRefresh,
    onSelectionRefresh: vi.fn(),
  });
  await flushLibraryState();
  const initialItems = values.at(-1)?.items;

  loadGalleryLibrarySnapshotMock.mockResolvedValueOnce({
    estimate: { usage: 10, quota: 20 },
    nextItems: [createItemWithUnrelatedGraph()],
  });
  await act(async () => values.at(-1)?.refresh());

  expect(values.at(-1)?.items).toBe(initialItems);
  expect(onBanner).not.toHaveBeenCalled();
  expect(onPreviewItemRefresh).toHaveBeenCalledOnce();
});
