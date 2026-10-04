// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  getAggregatePreviewBlobMock,
  getMediaAssetBlobMock,
  getWebSnapshotScreenshotFileMock,
  validateWebSnapshotScreenshotBlobMock,
} = vi.hoisted(() => ({
  getAggregatePreviewBlobMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getWebSnapshotScreenshotFileMock: vi.fn(),
  validateWebSnapshotScreenshotBlobMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/aggregate-presentations')
  >()),
  getAggregatePreviewBlob: getAggregatePreviewBlobMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: getMediaAssetBlobMock,
  })
);

vi.mock('../../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/web-snapshots')>()),
  getWebSnapshotScreenshotFile: getWebSnapshotScreenshotFileMock,
}));

vi.mock('../../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/web-snapshot/screenshot-validation')
  >()),
  validateWebSnapshotScreenshotBlob: validateWebSnapshotScreenshotBlobMock,
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
  validateWebSnapshotScreenshotBlobMock.mockResolvedValue({ height: 720, width: 1280 });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('uses the durable screenshot object for web snapshot previews', async () => {
  const thumbnail = new File(['preview'], 'screenshot.png', { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getWebSnapshotScreenshotFileMock.mockResolvedValue(thumbnail);

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
        filename: 'snapshot.sniptale-page-package.zip',
        id: 'asset-web',
        kind: 'web-archive',
        mimeType: 'application/x-sniptale-page-package+zip',
        source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
      },
      url: null,
    });
  });
  await flushEffects();

  expect(getWebSnapshotScreenshotFileMock).toHaveBeenCalledWith('snapshot-1');
  expect(validateWebSnapshotScreenshotBlobMock).toHaveBeenCalledWith(thumbnail);
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(URL.createObjectURL).toHaveBeenCalledWith(thumbnail);
  expect(latest()?.state.session.url).toBe('blob:preview');
  expect(latest()?.state.session.loadStatus).toBe('ready');
});

it.each([
  ['corrupt', 'Web snapshot screenshot is invalid.'],
  ['over-dimension', 'Web snapshot screenshot dimensions exceed safe limits.'],
])('rejects %s web snapshot previews before creating an object url', async (_case, message) => {
  const screenshot = new File(['unsafe'], 'screenshot.png', { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getWebSnapshotScreenshotFileMock.mockResolvedValue(screenshot);
  validateWebSnapshotScreenshotBlobMock.mockRejectedValue(new Error(message));

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
        filename: 'snapshot.sniptale-page-package.zip',
        id: 'asset-web',
        kind: 'web-archive',
        mimeType: 'application/x-sniptale-page-package+zip',
        source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
      },
      url: null,
    });
  });
  await flushEffects();

  expect(validateWebSnapshotScreenshotBlobMock).toHaveBeenCalledWith(screenshot);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  expect(latest()?.state.session.url).toBeNull();
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
  getAggregatePreviewBlobMock.mockResolvedValue(blob);

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();

  expect(getAggregatePreviewBlobMock).toHaveBeenCalledWith({ id: 'asset-1', kind: 'image' });
  expect(latest()?.state.draft.filename).toBe('preview.png');
  expect(latest()?.state.draft.tags).toEqual(['alpha']);
  expect(latest()?.state.session.url).toBe('blob:preview');
  expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
});

it('preserves newer filename and tag edits when the selected item refreshes', async () => {
  getAggregatePreviewBlobMock.mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  act(() => root?.render(<HookProbe onValue={(value) => values.push(value)} />));
  const latest = () => values.at(-1);

  act(() =>
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null })
  );
  await flushEffects();
  act(() => {
    latest()?.actions.setFilenameDraft('my edit.png');
    latest()?.actions.setTagDrafts(['alpha', 'mine']);
    latest()?.actions.setTagDraft('unfinished');
  });
  act(() =>
    latest()?.actions.setPreview((current) => ({
      ...current,
      item: { ...createItem(), filename: 'saved.png', tags: ['server'], updatedAt: 3 },
      url: null,
    }))
  );
  await flushEffects();

  expect(latest()?.state.draft).toMatchObject({
    filename: 'my edit.png',
    initialFilename: 'saved.png',
    tags: ['alpha', 'mine'],
    initialTagDrafts: ['server'],
    tagInput: 'unfinished',
    hasChanges: true,
  });

  act(() =>
    latest()?.actions.setPreview((current) => ({
      ...current,
      item: { ...createItem(), filename: 'next.png', tags: ['new'], updatedAt: 4 },
      url: null,
    }))
  );
  await flushEffects();
  expect(latest()?.state.draft.filename).toBe('my edit.png');
  expect(latest()?.state.draft.initialFilename).toBe('next.png');
});

it('adopts refreshed fields that have no local edits', async () => {
  getAggregatePreviewBlobMock.mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  act(() => root?.render(<HookProbe onValue={(value) => values.push(value)} />));
  const latest = () => values.at(-1);
  act(() =>
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null })
  );
  await flushEffects();
  act(() =>
    latest()?.actions.setPreview((current) => ({
      ...current,
      item: { ...createItem(), filename: 'saved.png', tags: ['server'], updatedAt: 3 },
      url: null,
    }))
  );
  await flushEffects();
  expect(latest()?.state.draft).toMatchObject({
    filename: 'saved.png',
    initialFilename: 'saved.png',
    tags: ['server'],
    initialTagDrafts: ['server'],
    hasChanges: false,
  });
});

it('keeps a deliberate baseline restore when an in-flight write refreshes the same item', async () => {
  getAggregatePreviewBlobMock.mockResolvedValue(new Blob(['preview'], { type: 'image/png' }));
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  act(() => root?.render(<HookProbe onValue={(value) => values.push(value)} />));
  const latest = () => values.at(-1);
  act(() =>
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null })
  );
  await flushEffects();

  act(() => latest()?.actions.setFilenameDraft('temporary.png'));
  act(() => latest()?.actions.setFilenameDraft('preview.png'));
  act(() =>
    latest()?.actions.setPreview((current) => ({
      ...current,
      item: { ...createItem(), filename: 'temporary.png', updatedAt: 3 },
      url: null,
    }))
  );
  await flushEffects();

  expect(latest()?.state.draft).toMatchObject({
    filename: 'preview.png',
    initialFilename: 'temporary.png',
    hasChanges: true,
  });
});

it('loads a scenario image preview from its stored asset', async () => {
  const blob = new Blob(['image'], { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getMediaAssetBlobMock.mockResolvedValue(blob);

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });
  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({
      inspectorCollapsed: false,
      item: {
        ...createItem(),
        kind: 'image',
        source: { kind: 'stored-asset', assetId: 'asset-1' },
      },
      url: null,
    });
  });
  await flushEffects();

  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('asset-1');
  expect(getAggregatePreviewBlobMock).not.toHaveBeenCalled();
  expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  expect(latest()?.state.session.url).toBe('blob:preview');
});

it('clears preview url when no item is selected and tolerates null or failed blob loads', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  getAggregatePreviewBlobMock
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('blob failed'));

  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBeNull();
  expect(latest()?.state.session.loadStatus).toBe('missing');

  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBeNull();
  expect(latest()?.state.session.loadStatus).toBe('error');

  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: null, url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.url).toBeNull();
  expect(latest()?.state.session.loadStatus).toBeUndefined();
});

it('keeps loading tied to the selected item through A to B to C and discards late results', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  const resolvers: Array<(blob: Blob | null) => void> = [];
  getAggregatePreviewBlobMock.mockImplementation(
    () => new Promise<Blob | null>((resolve) => resolvers.push(resolve))
  );
  vi.mocked(URL.createObjectURL).mockReturnValue('blob:third');

  act(() => root?.render(<HookProbe onValue={(value) => values.push(value)} />));
  const latest = () => values.at(-1);
  for (const id of ['asset-a', 'asset-b', 'asset-c']) {
    act(() => {
      latest()?.actions.setPreview({
        inspectorCollapsed: false,
        item: { ...createItem(), id, filename: `${id}.png` },
        url: 'blob:stale',
      });
    });
    expect(latest()?.state.session.item?.id).toBe(id);
    expect(latest()?.state.session.url).toBeNull();
    expect(latest()?.state.session.loadStatus).toBe('loading');
  }

  await act(async () => resolvers[1]?.(null));
  await act(async () => resolvers[0]?.(new Blob(['old'])));
  expect(latest()?.state.session.item?.id).toBe('asset-c');
  expect(latest()?.state.session.loadStatus).toBe('loading');
  expect(URL.createObjectURL).not.toHaveBeenCalled();

  await act(async () => resolvers[2]?.(new Blob(['current'])));
  expect(latest()?.state.session.url).toBe('blob:third');
  expect(latest()?.state.session.loadStatus).toBe('ready');
});

it('remembers the last inspector position after the preview item closes', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  act(() => {
    root?.render(<HookProbe onValue={(value) => values.push(value)} />);
  });

  const latest = () => values.at(-1);
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: true, item: createItem(), url: null });
  });
  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: null, url: null });
  });

  expect(latest()?.state.session.inspectorCollapsed).toBe(true);
});

it('revokes the previous object url when the selected item changes or the hook unmounts', async () => {
  const firstBlob = new Blob(['first'], { type: 'image/png' });
  const secondBlob = new Blob(['second'], { type: 'image/png' });
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  const createObjectURL = vi
    .mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');

  getAggregatePreviewBlobMock.mockResolvedValueOnce(firstBlob).mockResolvedValueOnce(secondBlob);

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

it('shows loading when the current media revision requests a new blob', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  let resolveReload!: (blob: Blob | null) => void;
  getAggregatePreviewBlobMock
    .mockResolvedValueOnce(new Blob(['first'], { type: 'image/png' }))
    .mockImplementationOnce(() => new Promise<Blob | null>((resolve) => (resolveReload = resolve)));
  act(() => root?.render(<HookProbe onValue={(value) => values.push(value)} />));
  const latest = () => values.at(-1);

  act(() => {
    latest()?.actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null });
  });
  await flushEffects();
  expect(latest()?.state.session.loadStatus).toBe('ready');

  act(() => {
    latest()?.actions.setPreview((current) => ({
      ...current,
      item: current.item ? { ...current.item, updatedAt: current.item.updatedAt + 1 } : null,
      url: null,
    }));
  });
  expect(latest()?.state.session.loadStatus).toBe('loading');
  expect(latest()?.state.session.url).toBeNull();

  await act(async () => resolveReload(new Blob(['reloaded'], { type: 'image/png' })));
  expect(latest()?.state.session.loadStatus).toBe('ready');
});

it('clears carried preview urls synchronously when the selected item changes', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  let resolveSecondBlobLoad!: (blob: Blob | null) => void;

  getAggregatePreviewBlobMock
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

  getAggregatePreviewBlobMock
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

it('retains acknowledged media through navigation until presentation, then releases on close', async () => {
  const values: ReturnType<typeof useGalleryPreviewState>[] = [];
  vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:next');
  getAggregatePreviewBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  act(() => root?.render(<HookProbe onValue={(value) => values.push(value)} />));
  const latest = () => values.at(-1)!;
  act(() =>
    latest().actions.setPreview({ inspectorCollapsed: false, item: createItem(), url: null })
  );
  await flushEffects();
  const firstRevision = latest().state.session.requestRevision!;
  act(() =>
    latest().actions.acknowledgePresented({
      requestRevision: firstRevision,
      url: 'blob:first',
      outcome: 'presented',
    })
  );
  act(() =>
    latest().actions.setPreview({
      inspectorCollapsed: false,
      item: { ...createItem(), id: 'next' },
      url: null,
    })
  );
  await flushEffects();
  const nextRevision = latest().state.session.requestRevision!;
  expect(nextRevision).toBeGreaterThan(firstRevision);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() =>
    latest().actions.acknowledgePresented({
      requestRevision: firstRevision,
      url: null,
      outcome: 'terminal',
    })
  );
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() =>
    latest().actions.acknowledgePresented({
      requestRevision: nextRevision,
      url: 'blob:next',
      outcome: 'presented',
    })
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:first');
  act(() => latest().actions.setPreview({ inspectorCollapsed: false, item: null, url: null }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:next');
});
