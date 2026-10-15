// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import { ReviewPresentationLibrary } from './presentation-library';
import { usePresentationLibrary } from './use-presentation-library';
import type { GallerySavedView } from '../../composition/persistence/gallery-saved-views';

const library = vi.hoisted(() => ({
  list: vi.fn<() => Promise<MediaLibraryItem[]>>(),
  thumbnail: vi.fn(),
  views: vi.fn<() => Promise<GallerySavedView[]>>(),
}));
vi.mock('../../composition/persistence/media-library', () => ({
  listMediaLibrary: library.list,
  getMediaThumbnail: library.thumbnail,
  getMediaAssetBlob: vi.fn(),
}));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: library.views,
}));

let host: HTMLDivElement;
let parent: HTMLDialogElement;
let trigger: HTMLButtonElement;
let root: Root;
let closedWhileConnected: boolean[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  closedWhileConnected = [];
  library.list.mockResolvedValue([]);
  library.thumbnail.mockReset();
  library.views.mockResolvedValue([]);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
      this.querySelector<HTMLElement>('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      closedWhileConnected.push(this.isConnected);
      this.open = false;
    },
  });
  parent = document.createElement('dialog');
  parent.open = true;
  trigger = document.createElement('button');
  trigger.textContent = 'Library';
  host = document.createElement('div');
  parent.append(trigger, host);
  document.body.append(parent);
  root = createRoot(host);
  trigger.focus();
});
afterEach(async () => {
  await act(async () => root.unmount());
  parent.remove();
  vi.unstubAllGlobals();
});
function Surface() {
  const [open, setOpen] = useState(true);
  return open ? (
    <ReviewPresentationLibrary
      anchor={host}
      kind="video"
      busy={false}
      onSelect={vi.fn()}
      onClose={() => setOpen(false)}
    />
  ) : null;
}
it('allows retry after listing failure without retaining a failed status', async () => {
  library.list.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce([]);
  function Listing() {
    const { status, retry, visibleItems } = usePresentationLibrary('image', '', '');
    return (
      <button onClick={retry}>
        {status}:{visibleItems.length}
      </button>
    );
  }
  await act(async () => root.render(<Listing />));
  expect(host.textContent).toBe('failed:0');
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toBe('ready:0');
});

it('ignores a stale listing after switching the requested media kind', async () => {
  let resolveOld!: (items: MediaLibraryItem[]) => void;
  library.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      })
  );
  library.list.mockResolvedValueOnce([item('still.png', 'image')]);
  function Listing({ kind }: { kind: 'video' | 'image' }) {
    const { status, visibleItems } = usePresentationLibrary(kind, '', '');
    return (
      <span>
        {status}:{visibleItems.map((row) => row.filename).join(',')}
      </span>
    );
  }
  await act(async () => root.render(<Listing kind="video" />));
  expect(host.textContent).toBe('loading:');
  await act(async () => root.render(<Listing kind="image" />));
  expect(host.textContent).toBe('ready:still.png');
  await act(async () => resolveOld([item('old.webm', 'video')]));
  expect(host.textContent).toBe('ready:still.png');
});
it('closes a nested drawer while connected and restores its trigger after native cancel', async () => {
  expect(document.activeElement).toBe(trigger);
  await act(async () => root.render(<Surface />));
  const drawer = document.querySelector<HTMLDialogElement>('dialog[aria-label]')!;
  expect(drawer.open).toBe(true);
  expect(drawer.contains(document.activeElement)).toBe(true);
  const cancel = new Event('cancel', { cancelable: true });
  await act(async () => drawer.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(drawer.isConnected).toBe(false);
  expect(closedWhileConnected).toEqual([true]);
  expect(document.activeElement).toBe(trigger);
  expect(parent.open).toBe(true);
});
it('does not focus a disconnected trigger when the drawer unmounts', async () => {
  await act(async () => root.render(<Surface />));
  const focus = vi.spyOn(trigger, 'focus');
  trigger.remove();
  await act(async () => root.render(null));
  expect(closedWhileConnected).toEqual([true]);
  expect(focus).not.toHaveBeenCalled();
  expect(parent.open).toBe(true);
});

function item(id: string, kind: MediaLibraryItem['kind']): MediaLibraryItem {
  return {
    id,
    kind,
    filename: id,
    originalFilename: id,
    source: { kind: 'stored-asset', assetId: id },
    createdAt: 1,
    updatedAt: 1,
    size: 100,
    mimeType: kind === 'video' ? 'video/webm' : 'image/png',
    width: 100,
    height: 100,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    hasThumbnail: false,
  };
}
it('offers only live matching media and passes identity without reading source bytes', async () => {
  const video = item('video.webm', 'video');
  library.list.mockResolvedValue([
    video,
    item('still.png', 'image'),
    item('shot.png', 'screenshot'),
    {
      ...item('trash.webm', 'video'),
      lifecycle: { storageClass: 'library', updatedAt: 2, savedAt: 1, trashedAt: 2 },
    },
  ]);
  const select = vi.fn();
  await act(async () =>
    root.render(
      <ReviewPresentationLibrary
        anchor={host}
        kind="video"
        busy={false}
        onSelect={select}
        onClose={vi.fn()}
      />
    )
  );
  const drawer = document.querySelector<HTMLDialogElement>('dialog[aria-label]')!;
  expect(drawer.querySelectorAll('button[title="video.webm"]')).toHaveLength(1);
  expect(drawer.textContent).not.toContain('still.png');
  expect(drawer.textContent).not.toContain('trash.webm');
  act(() => drawer.querySelector<HTMLButtonElement>('button[title="video.webm"]')!.click());
  expect(select).toHaveBeenCalledExactlyOnceWith('video.webm');
  expect(library.thumbnail).not.toHaveBeenCalled();
  await act(async () =>
    root.render(
      <ReviewPresentationLibrary
        anchor={host}
        kind="image"
        busy={false}
        onSelect={select}
        onClose={vi.fn()}
      />
    )
  );
  expect(drawer.textContent).toContain('still.png');
  expect(drawer.textContent).toContain('shot.png');
  expect(drawer.querySelector('button[title="video.webm"]')).toBeNull();
});

it('loads only a visible thumbnail and revokes its URL when the drawer closes', async () => {
  library.list.mockResolvedValue([item('clip.webm', 'video')]);
  library.thumbnail.mockResolvedValue({ blob: new Blob(['thumb'], { type: 'image/webp' }) });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() {
        this.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        );
      }
      disconnect() {}
    }
  );
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumbnail');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  await act(async () => root.render(<Surface />));
  expect(library.thumbnail).toHaveBeenCalledExactlyOnceWith('clip.webm');
  expect(create).toHaveBeenCalledOnce();
  expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:thumbnail');
  await act(async () => root.render(null));
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:thumbnail');
  create.mockRestore();
  revoke.mockRestore();
});

function savedView(folderFilter: GallerySavedView['folderFilter']): GallerySavedView {
  return {
    id: `${folderFilter}-filter`,
    name: 'Work',
    folderFilter,
    createdAt: 1,
    updatedAt: 1,
    filters: {
      activeTags: ['work'],
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
  };
}

it('intersects a saved image filter with its parent section instead of admitting tagged videos', async () => {
  library.list.mockResolvedValue(
    [item('still.png', 'image'), item('clip.webm', 'video')].map((row) => ({
      ...row,
      tags: ['work'],
    }))
  );
  library.views.mockResolvedValue([
    savedView('screenshot'),
    savedView('recording'),
    savedView('audio'),
  ]);
  function Listing() {
    const { views, visibleItems } = usePresentationLibrary('media', '', 'view:screenshot-filter');
    return (
      <span>
        {views.map((view) => view.folderFilter).join(',')}:
        {visibleItems.map((row) => row.filename).join(',')}
      </span>
    );
  }
  await act(async () => root.render(<Listing />));
  expect(host.textContent).toBe('screenshot,recording:still.png');
});

it.each(['image', 'video'] as const)(
  'selects the %s parent independently of saved filters',
  async (section) => {
    library.list.mockResolvedValue([item('still.png', 'image'), item('clip.webm', 'video')]);
    function Listing() {
      const { visibleItems } = usePresentationLibrary('media', '', `section:${section}`);
      return <span>{visibleItems.map((row) => row.filename).join(',')}</span>;
    }
    await act(async () => root.render(<Listing />));
    expect(host.textContent).toBe(section === 'image' ? 'still.png' : 'clip.webm');
  }
);

it('falls back to all supported media when a saved filter no longer exists, preserving the query', async () => {
  library.list.mockResolvedValue([
    item('work.png', 'image'),
    item('work.webm', 'video'),
    item('other.png', 'image'),
  ]);
  function Listing() {
    const { visibleItems, activeViewId } = usePresentationLibrary('media', 'work', 'view:removed');
    return (
      <span>
        {activeViewId}:{visibleItems.map((row) => row.filename).join(',')}
      </span>
    );
  }
  await act(async () => root.render(<Listing />));
  expect(host.textContent).toBe('section:all:work.png,work.webm');
});
