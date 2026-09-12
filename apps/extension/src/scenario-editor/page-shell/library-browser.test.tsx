// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
const io = vi.hoisted(() => ({
  list: vi.fn(),
  views: vi.fn(),
  presentation: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  choose: vi.fn(),
  drag: vi.fn(),
}));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.list }));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: io.views,
}));
vi.mock('../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: io.presentation,
}));
import { GuideLibraryBrowser } from './library-browser';
let root: Root;
let host: HTMLDivElement;
const item: MediaLibraryItem = {
  id: 'image',
  kind: 'image',
  filename: 'Current.png',
  originalFilename: 'Current.png',
  source: { kind: 'screenshot' },
  createdAt: 1,
  updatedAt: 2,
  size: 100,
  mimeType: 'image/png',
  width: 640,
  height: 480,
  duration: null,
  sourceUrl: null,
  sourceTitle: null,
  sourceFavicon: null,
  tags: ['guide'],
  workspaceRevision: 2,
  hasThumbnail: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.list.mockResolvedValue([item]);
  io.views.mockResolvedValue([]);
  io.presentation.mockResolvedValue({
    presentationRevision: 2,
    thumbnailBlob: new Blob(['thumb']),
    previewBlob: new Blob(['current']),
  });
  let serial = 0;
  io.create.mockImplementation(() => `blob:${++serial}`);
  vi.stubGlobal('URL', { createObjectURL: io.create, revokeObjectURL: io.revoke });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <GuideLibraryBrowser
        t={createTranslator('en')}
        disabled={disabled}
        selectedIds={[]}
        onChoose={io.choose}
        onDragStart={io.drag}
        fileAction={null}
      />
    )
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (entry) =>
      entry.textContent === label ||
      entry.getAttribute('aria-label') === label ||
      entry.title === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
it('loads images immediately and displays current revision previews with URL cleanup', async () => {
  await render();
  expect(host.querySelectorAll('.guide-library-card')).toHaveLength(1);
  await click('Current.png');
  expect(io.choose).toHaveBeenCalledWith('image', 'Current.png');
  expect(host.querySelector('.guide-library-preview img')?.getAttribute('src')).toBe('blob:2');
  expect(io.create.mock.calls[1]?.[0]).toEqual(new Blob(['current']));
  act(() => root.render(null));
  expect(io.revoke.mock.calls.map((entry) => entry[0])).toEqual(
    expect.arrayContaining(['blob:1', 'blob:2'])
  );
});
it('does not substitute an original or stale preview and allows retry', async () => {
  io.presentation.mockResolvedValue({
    presentationRevision: 1,
    thumbnailBlob: new Blob(['old']),
    previewBlob: new Blob(['old']),
  });
  await render();
  await click('Current.png');
  expect(host.querySelector('.guide-library-preview [role="alert"]')).not.toBeNull();
  expect(io.create).not.toHaveBeenCalled();
  io.list.mockResolvedValue([{ ...item }]);
  io.presentation.mockResolvedValue({
    presentationRevision: 2,
    thumbnailBlob: new Blob(['new']),
    previewBlob: new Blob(['new']),
  });
  await click('Refresh library');
  expect(host.querySelector('.guide-library-preview img')).not.toBeNull();
});
it('rejects late presentation results after unmount', async () => {
  let finish: ((value: unknown) => void) | undefined;
  io.presentation.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render();
  act(() => root.render(null));
  await act(async () => finish?.({ presentationRevision: 2, thumbnailBlob: new Blob(['late']) }));
  expect(io.create).not.toHaveBeenCalled();
});
it('retries metadata failures and applies saved library filters', async () => {
  io.list.mockRejectedValueOnce(new Error('unavailable'));
  io.views.mockResolvedValue([
    {
      id: 'saved',
      name: 'Tagged guide',
      folderFilter: 'screenshot',
      createdAt: 1,
      updatedAt: 1,
      filters: {
        activeTags: ['guide'],
        scope: 'all',
        facetFilters: {
          created: [],
          updated: [],
          format: [],
          size: [],
          resolution: [],
          duration: [],
          source: [],
        },
      },
    },
  ]);
  await render();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  io.list.mockResolvedValue([item, { ...item, id: 'other', filename: 'Other.png', tags: [] }]);
  await click('Refresh library');
  expect(host.querySelectorAll('.guide-library-card')).toHaveLength(2);
  await click('Tagged guide');
  expect(host.querySelectorAll('.guide-library-card')).toHaveLength(1);
});

it('exports only the library identity for native dragging and rejects disabled drags', async () => {
  await render();
  const card = host.querySelector('.guide-library-card')!;
  const setData = vi.fn();
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { setData, effectAllowed: 'none' } });
  act(() => card.dispatchEvent(event));
  expect(setData).toHaveBeenCalledWith(
    'application/x-sniptale-library-image',
    JSON.stringify({ mediaId: 'image' })
  );
  expect(io.drag).toHaveBeenCalledTimes(1);
  expect(io.choose).not.toHaveBeenCalled();
  await render(true);
  const disabledEvent = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(disabledEvent, 'dataTransfer', {
    value: { setData, effectAllowed: 'none' },
  });
  act(() => card.dispatchEvent(disabledEvent));
  expect(disabledEvent.defaultPrevented).toBe(true);
  expect(io.drag).toHaveBeenCalledTimes(1);
});
