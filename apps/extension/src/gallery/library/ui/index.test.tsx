// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { formatDateTimeMock, getCurrentLocaleMock, getMediaThumbnailMock, revokeObjectURLMock } =
  vi.hoisted(() => ({
    formatDateTimeMock: vi.fn(() => 'Jan 01, 2024, 12:30 PM'),
    getCurrentLocaleMock: vi.fn(() => 'en'),
    getMediaThumbnailMock: vi.fn(),
    revokeObjectURLMock: vi.fn(),
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

function renderThumb(kind: Parameters<typeof MediaThumb>[0]['kind'], assetId = 'asset-1') {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<MediaThumb assetId={assetId} {...(kind === undefined ? {} : { kind })} />);
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
  getMediaThumbnailMock.mockResolvedValue({
    blob: new Blob(['thumb']),
  });
  const item = createMediaThumbItem('asset-stable', 1);

  renderItemThumb(item);
  await flushEffects();
  renderItemThumb({ ...item, updatedAt: 2 });
  await flushEffects();

  expect(getMediaThumbnailMock).toHaveBeenCalledTimes(1);
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
