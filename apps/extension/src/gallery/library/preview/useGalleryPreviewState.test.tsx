// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getMediaAssetBlobMock, loadWebSnapshotScreenshotBlobMock } = vi.hoisted(() => ({
  getMediaAssetBlobMock: vi.fn(),
  loadWebSnapshotScreenshotBlobMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: getMediaAssetBlobMock,
  })
);

vi.mock('../../web-snapshot/package', () => ({
  loadWebSnapshotScreenshotBlob: loadWebSnapshotScreenshotBlobMock,
}));

import { useGalleryPreviewState } from './useGalleryPreviewState';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function flushEffects() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createItem() {
  return {
    id: 'asset-1',
    type: 'media' as const,
    kind: 'screenshot' as const,
    source: { kind: 'screenshot' as const },
    filename: 'preview.png',
    originalFilename: 'preview.png',
    createdAt: 1,
    updatedAt: 2,
    size: 2048,
    mimeType: 'image/png',
    width: 1280,
    height: 720,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: ['alpha'],
    hasThumbnail: false,
  };
}

function HookProbe(props: { onValue: (value: ReturnType<typeof useGalleryPreviewState>) => void }) {
  props.onValue(useGalleryPreviewState());
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('uses the full stored screenshot from the ZIP package for web snapshot previews', async () => {
  const packageBlob = new Blob(['zip'], { type: 'application/zip' });
  const thumbnail = new Blob(['preview'], { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getMediaAssetBlobMock.mockResolvedValue(packageBlob);
  loadWebSnapshotScreenshotBlobMock.mockResolvedValue(thumbnail);

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({
      inspectorCollapsed: false,
      item: {
        ...createItem(),
        entityId: 'snapshot-1',
        id: 'asset-web',
        kind: 'web-archive',
        mimeType: 'application/zip',
        source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
      },
      url: null,
    });
  });
  await flushEffects();

  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('snapshot-1');
  expect(loadWebSnapshotScreenshotBlobMock).toHaveBeenCalledWith(packageBlob);
  expect(URL.createObjectURL).toHaveBeenCalledWith(thumbnail);
  expect(latest()?.state.session.url).toBe('blob:preview');
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

it('loads preview blobs and seeds filename and tag drafts from the selected item', async () => {
  const blob = new Blob(['preview'], { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getMediaAssetBlobMock.mockResolvedValue(blob);

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();

  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('asset-1');
  expect(latest()?.state.draft.filename).toBe('preview.png');
  expect(latest()?.state.draft.tags).toEqual(['alpha']);
  expect(latest()?.state.session.url).toBe('blob:preview');
  expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
});

it('clears preview url when no item is selected and tolerates null or failed blob loads', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getMediaAssetBlobMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('blob failed'));

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBeNull();

  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBeNull();

  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: null, url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBeNull();
});

it('revokes the previous object url when the selected item changes or the hook unmounts', async () => {
  const firstBlob = new Blob(['first'], { type: 'image/png' });
  const secondBlob = new Blob(['second'], { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  const createObjectURL = vi
    .mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');

  getMediaAssetBlobMock.mockResolvedValueOnce(firstBlob).mockResolvedValueOnce(secondBlob);

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();

  act(() => {
    latest()?.actions.setPreview({
      inspectorCollapsed: false,
      item: { ...createItem(), id: 'asset-2', filename: 'second.png' },
      url: null,
    });
  });
  await flushEffects();

  expect(createObjectURL).toHaveBeenCalledTimes(2);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');

  act(() => {
    root?.unmount();
  });

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
  root = null;
});

it('clears carried preview urls synchronously when the selected item changes', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  let resolveSecondBlobLoad!: (blob: Blob | null) => void;

  getMediaAssetBlobMock
    .mockResolvedValueOnce(new Blob(['first'], { type: 'image/png' }))
    .mockImplementationOnce(
      () =>
        new Promise<Blob | null>((resolve) => {
          resolveSecondBlobLoad = resolve;
        })
    );

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBe('blob:preview');

  act(() => {
    latest()?.actions.setPreview((current) => ({
      ...current,
      item: {
        ...createItem(),
        filename: 'second.png',
        hasThumbnail: false,
        id: 'asset-2',
      },
      url: current.url,
    }));
  });

  expect(latest()?.state.session.url).toBeNull();

  await act(async () => resolveSecondBlobLoad(new Blob(['second'], { type: 'image/png' })));
  expect(latest()?.state.session.url).toBe('blob:preview');
});

it('ignores stale blob-load failures after the preview item changes', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  let rejectFirstBlobLoad!: (error: Error) => void;

  getMediaAssetBlobMock
    .mockImplementationOnce(
      () =>
        new Promise<Blob | null>((_, reject) => {
          rejectFirstBlobLoad = reject;
        })
    )
    .mockResolvedValueOnce(new Blob(['second'], { type: 'image/png' }));

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);

  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });

  act(() => {
    latest()?.actions.setPreview({
      inspectorCollapsed: false,
      item: { ...createItem(), id: 'asset-2', filename: 'second.png' },
      url: null,
    });
  });
  await flushEffects();

  rejectFirstBlobLoad(new Error('stale blob failed'));
  await flushEffects();

  expect(latest()?.state.session.url).toBe('blob:preview');
});
