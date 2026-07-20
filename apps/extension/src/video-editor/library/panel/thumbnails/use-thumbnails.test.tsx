// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLibraryThumbnails } from './use-thumbnails';
import type { LibraryThumbnailItem } from './types';

const hookMocks = vi.hoisted(() => ({
  ensureLibraryThumbnailMock: vi.fn(),
}));

vi.mock('./ensure', () => ({
  createLibraryThumbnailService: vi.fn(),
  ensureLibraryThumbnail: hookMocks.ensureLibraryThumbnailMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const oldBlob = new Blob(['old'], { type: 'image/webp' });
const newBlob = new Blob(['new'], { type: 'image/webp' });

function createItem(id: string): LibraryThumbnailItem {
  return {
    createdAt: 100,
    id,
    mimeType: 'video/webm',
    sourceMediaId: `recording:${id}`,
    thumbnailId: `recording:${id}`,
  };
}

function ThumbnailProbe({ items }: { items: LibraryThumbnailItem[] }) {
  const thumbnails = useLibraryThumbnails(items);
  const urls = Object.values(thumbnails).map((thumbnail) => thumbnail.url);

  return <div data-urls={urls.join(',')} />;
}

async function renderProbe(items: LibraryThumbnailItem[]) {
  await act(async () => {
    root?.render(<ThumbnailProbe items={items} />);
    await Promise.resolve();
  });
}

function createDeferredEntry(blob: Blob) {
  let resolveEntry: () => void = () => undefined;
  const promise = new Promise((resolve) => {
    resolveEntry = () =>
      resolve({
        assetId: 'recording:recording-1',
        blob,
        createdAt: 100,
        height: 180,
        updatedAt: 100,
        width: 320,
      });
  });

  return { promise, resolveEntry };
}

function createResolvedEntry(blob: Blob) {
  return {
    assetId: 'recording:recording-1',
    blob,
    createdAt: 100,
    height: 180,
    updatedAt: 100,
    width: 320,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => (blob === oldBlob ? 'blob:old' : 'blob:new')),
      revokeObjectURL: vi.fn(),
    })
  );
  hookMocks.ensureLibraryThumbnailMock.mockResolvedValue({
    assetId: 'recording:recording-1',
    blob: oldBlob,
    createdAt: 100,
    height: 180,
    updatedAt: 100,
    width: 320,
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('revokes created object URLs when the thumbnail owner unmounts', async () => {
  await renderProbe([createItem('recording-1')]);

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old');
});

it('revokes stale object URLs when an older thumbnail load finishes after list changes', async () => {
  const oldEntry = createDeferredEntry(oldBlob);
  const newEntry = createDeferredEntry(newBlob);
  hookMocks.ensureLibraryThumbnailMock
    .mockReturnValueOnce(oldEntry.promise)
    .mockReturnValueOnce(newEntry.promise);

  await renderProbe([createItem('recording-1')]);
  await renderProbe([createItem('recording-2')]);

  await act(async () => {
    oldEntry.resolveEntry();
    await oldEntry.promise;
  });

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old');

  await act(async () => {
    newEntry.resolveEntry();
    await newEntry.promise;
  });

  expect(container?.querySelector('div')?.getAttribute('data-urls')).toContain('blob:new');
});

it('limits parallel thumbnail generation for large library lists', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const resolvers: Array<() => void> = [];
  hookMocks.ensureLibraryThumbnailMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        resolvers.push(() => {
          inFlight -= 1;
          resolve(createResolvedEntry(oldBlob));
        });
      })
  );

  await renderProbe([1, 2, 3, 4, 5].map((index) => createItem(`recording-${index}`)));
  expect(maxInFlight).toBe(3);
  expect(hookMocks.ensureLibraryThumbnailMock).toHaveBeenCalledTimes(3);

  await act(async () => {
    resolvers.shift()?.();
    await Promise.resolve();
  });

  expect(hookMocks.ensureLibraryThumbnailMock).toHaveBeenCalledTimes(4);
  expect(maxInFlight).toBe(3);
});

it('keeps loaded thumbnail object URLs across equivalent list rerenders', async () => {
  await renderProbe([createItem('recording-1')]);

  await act(async () => {
    await Promise.resolve();
  });

  await renderProbe([{ ...createItem('recording-1'), createdAt: 200 }]);

  expect(hookMocks.ensureLibraryThumbnailMock).toHaveBeenCalledTimes(1);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  expect(container?.querySelector('div')?.getAttribute('data-urls')).toContain('blob:old');
});
