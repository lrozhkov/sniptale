// @vitest-environment jsdom

import { act } from 'react';
import { createVideoProjectItem } from '../test-support/items';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  formatDateTimeMock,
  getAggregatePresentationMock,
  getCurrentLocaleMock,
  getMediaThumbnailMock,
  getGalleryProjectCoverMock,
  revokeObjectURLMock,
} = vi.hoisted(() => ({
  formatDateTimeMock: vi.fn(() => 'Jan 01, 2024, 12:30 PM'),
  getAggregatePresentationMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(() => 'en'),
  getMediaThumbnailMock: vi.fn(),
  getGalleryProjectCoverMock: vi.fn(),
  revokeObjectURLMock: vi.fn(),
}));

vi.mock('../items/project-covers', () => ({ getGalleryProjectCover: getGalleryProjectCoverMock }));

vi.mock('../../../composition/persistence/aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/aggregate-presentations')
  >()),
  getAggregatePresentation: getAggregatePresentationMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaThumbnail: getMediaThumbnailMock,
  })
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: formatDateTimeMock,
  getCurrentLocale: getCurrentLocaleMock,
  translate: (key: string) => key,
}));

import {
  FOLDER_LABELS,
  MediaThumb,
  formatDate,
  getGalleryFolderIcon,
  getGalleryItemKindLabel,
  getKindIcon,
  isImageKind,
  isVideoKind,
} from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderThumb(
  kind: Parameters<typeof MediaThumb>[0]['kind'],
  assetId = 'asset-1',
  fit?: Parameters<typeof MediaThumb>[0]['fit']
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <MediaThumb
        assetId={assetId}
        {...(kind === undefined ? {} : { kind })}
        {...(fit === undefined ? {} : { fit })}
      />
    );
  });
}

function renderItemThumb(item: NonNullable<Parameters<typeof MediaThumb>[0]['item']>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<MediaThumb item={item} />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:thumb'),
    revokeObjectURL: revokeObjectURLMock,
  });
  getMediaThumbnailMock.mockReset();
  getAggregatePresentationMock.mockReset();
  getGalleryProjectCoverMock.mockReset();
  revokeObjectURLMock.mockReset();
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

async function verifyGalleryHelpersAndLoadedThumb() {
  getAggregatePresentationMock.mockResolvedValue({
    thumbnailBlob: new Blob(['thumb']),
    updatedAt: 1,
  });
  getMediaThumbnailMock.mockResolvedValue({
    blob: new Blob(['thumb']),
  });

  renderThumb('screenshot');
  await flushEffects();

  expect(FOLDER_LABELS.all).toBeTruthy();
  expect(FOLDER_LABELS.scenario).toBeTruthy();
  expect(FOLDER_LABELS['web-snapshot']).toBe('gallery.preview.folderWebSnapshot');
  expect(getGalleryFolderIcon('scenario')).toBeTruthy();
  expect(getGalleryFolderIcon('web-snapshot')).toBeTruthy();
  expect(getGalleryItemKindLabel('audio')).toBeTruthy();
  expect(getGalleryItemKindLabel('web-archive')).toBe('gallery.preview.kindWebSnapshot');
  expect(getGalleryItemKindLabel('video-project')).toBe('gallery.preview.kindVideoProject');
  expect(getGalleryItemKindLabel('export')).toBe('gallery.preview.kindVideo');
  expect(getKindIcon('recording')).toBeTruthy();
  expect(getKindIcon('video-project')).toBeTruthy();
  expect(isImageKind('image')).toBe(true);
  expect(isVideoKind('video')).toBe(true);
  expect(isVideoKind('video-project')).toBe(true);
  expect(formatDate(Date.UTC(2024, 0, 1, 12, 30))).toBe('Jan 01, 2024, 12:30 PM');
  expect(getCurrentLocaleMock).toHaveBeenCalledTimes(1);
  expect(formatDateTimeMock).toHaveBeenCalledWith(
    Date.UTC(2024, 0, 1, 12, 30),
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
    'en'
  );
  const image = container?.querySelector('img');
  expect(image?.getAttribute('src')).toBe('blob:thumb');
  expect(image?.className).toContain('pointer-events-none');
  expect(image?.className).toContain('object-cover');
  expect(image?.getAttribute('data-fit')).toBe('cover');
}

async function verifyContainedThumb() {
  getMediaThumbnailMock.mockResolvedValue({ blob: new Blob(['thumb']) });
  renderThumb('image', 'asset-contained', 'contain');
  await flushEffects();

  const image = container?.querySelector('img');
  expect(image?.className).toContain('object-contain');
  expect(image?.className).not.toContain('object-cover');
  expect(image?.getAttribute('data-fit')).toBe('contain');
}

async function verifyFallbackThumbAndCleanup() {
  getMediaThumbnailMock.mockResolvedValue({
    blob: new Blob(['thumb']),
  });
  renderThumb('video', 'asset-1');
  await flushEffects();

  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:thumb');

  getMediaThumbnailMock.mockResolvedValue(null);
  renderThumb('audio', 'asset-2');
  await flushEffects();

  expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:thumb');
  expect(container?.querySelector('img')).toBeNull();
  expect(container?.querySelector('div')?.className).toContain('pointer-events-none');
}

async function verifySyntheticThumbRerendersDoNotReloadStableFallbacks() {
  getMediaThumbnailMock.mockResolvedValue({
    blob: new Blob(['thumb']),
  });

  renderThumb('video', 'asset-stable');
  await flushEffects();
  await flushEffects();

  expect(getMediaThumbnailMock).toHaveBeenCalledTimes(1);

  renderThumb('video', 'asset-stable');
  await flushEffects();

  expect(getMediaThumbnailMock).toHaveBeenCalledTimes(1);
}

async function verifyStableItemThumbRerendersDoNotReload() {
  getAggregatePresentationMock.mockResolvedValue({
    thumbnailBlob: new Blob(['thumb']),
    updatedAt: 1,
  });
  const item = createMediaThumbItem('asset-stable', 1);

  renderItemThumb(item);
  await flushEffects();
  renderItemThumb({ ...item, updatedAt: 2 });
  await flushEffects();

  expect(getAggregatePresentationMock).toHaveBeenCalledTimes(1);
  expect(getMediaThumbnailMock).not.toHaveBeenCalled();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURLMock).not.toHaveBeenCalled();
}

function runGalleryUiSuite() {
  it(
    'renders loaded thumbnails and covers exported gallery helpers',
    verifyGalleryHelpersAndLoadedThumb
  );
  it(
    'falls back to icon surfaces when no thumbnail is available and revokes blob urls on cleanup',
    verifyFallbackThumbAndCleanup
  );
  it(
    'keeps synthetic fallback thumbnail loads stable across rerenders with the same identity',
    verifySyntheticThumbRerendersDoNotReloadStableFallbacks
  );
  it(
    'keeps real item thumbnail loads stable across metadata-only rerenders',
    verifyStableItemThumbRerendersDoNotReload
  );
  it('can contain thumbnails without changing the default cover behavior', verifyContainedThumb);
}

describe('gallery-ui', runGalleryUiSuite);

function createMediaThumbItem(
  id: string,
  updatedAt: number
): NonNullable<Parameters<typeof MediaThumb>[0]['item']> {
  return {
    id,
    entityId: id,
    filename: `${id}.png`,
    createdAt: 1,
    updatedAt,
    hasThumbnail: true,
    kind: 'image',
    size: 100,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    mimeType: 'image/png',
    width: 100,
    height: 80,
    duration: null,
    source: { kind: 'screenshot' },
    type: 'media',
  };
}

it('clears the old project cover immediately when its workspace revision changes', async () => {
  getGalleryProjectCoverMock.mockResolvedValueOnce(new Blob(['first']));
  const item = {
    ...createVideoProjectItem(),
    hasThumbnail: true,
    presentationRevision: 1,
    workspaceRevision: 1,
  };
  renderItemThumb(item);
  await flushEffects();
  let resolveSecond: (blob: Blob) => void = () => {};
  getGalleryProjectCoverMock.mockReturnValueOnce(
    new Promise<Blob>((resolve) => {
      resolveSecond = resolve;
    })
  );
  renderItemThumb({ ...item, presentationRevision: 2, workspaceRevision: 2 });
  expect(container?.querySelector('img')).toBeNull();
  resolveSecond(new Blob(['second']));
  await flushEffects();
  expect(getGalleryProjectCoverMock).toHaveBeenCalledTimes(2);
  expect(getAggregatePresentationMock).not.toHaveBeenCalled();
  expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:thumb');
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
});

it('ignores an older project cover that finishes after the current revision', async () => {
  let resolveOld: (blob: Blob) => void = () => {};
  getGalleryProjectCoverMock.mockReturnValueOnce(
    new Promise<Blob>((resolve) => {
      resolveOld = resolve;
    })
  );
  getGalleryProjectCoverMock.mockResolvedValueOnce(new Blob(['current']));
  vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:current');
  const item = { ...createVideoProjectItem(), workspaceRevision: 1 };
  renderItemThumb(item);
  renderItemThumb({ ...item, workspaceRevision: 2 });
  await flushEffects();
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:current');
  resolveOld(new Blob(['old']));
  await flushEffects();
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:current');
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});

it('requests only viewport-near project covers in a large mounted list and releases hidden URLs', async () => {
  const observed = new Map<Element, IntersectionObserverCallback>();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        observed.set(target, this.callback);
      }
      unobserve(target: Element) {
        observed.delete(target);
      }
      disconnect() {
        for (const [target, callback] of observed)
          if (callback === this.callback) observed.delete(target);
      }
    }
  );
  getGalleryProjectCoverMock.mockResolvedValue(new Blob(['cover']));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const items = Array.from({ length: 80 }, (_, index) => ({
    ...createVideoProjectItem(),
    id: `video-project:${index}`,
    entityId: `project-${index}`,
  }));
  act(() =>
    root?.render(items.map((item) => <MediaThumb key={item.id} item={item} deferUntilVisible />))
  );
  await flushEffects();
  expect(getGalleryProjectCoverMock).not.toHaveBeenCalled();
  const targets = [...observed.keys()];
  expect(targets).toHaveLength(80);
  act(() =>
    observed.get(targets[41]!)?.(
      [{ isIntersecting: true, target: targets[41]! } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  );
  await flushEffects();
  expect(getGalleryProjectCoverMock).toHaveBeenCalledTimes(1);
  expect(getGalleryProjectCoverMock).toHaveBeenCalledWith(items[41], expect.any(AbortSignal));
  expect(container?.querySelectorAll('img')).toHaveLength(1);
  act(() =>
    observed.get(targets[41]!)?.(
      [{ isIntersecting: false, target: targets[41]! } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  );
  await flushEffects();
  expect(container?.querySelectorAll('img')).toHaveLength(0);
  expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:thumb');
  act(() =>
    observed.get(targets[41]!)?.(
      [{ isIntersecting: true, target: targets[41]! } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  );
  await flushEffects();
  expect(getGalleryProjectCoverMock).toHaveBeenCalledTimes(2);
  act(() => root?.unmount());
  root = null;
  expect(observed.size).toBe(0);
  expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
});
