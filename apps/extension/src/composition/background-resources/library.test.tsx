// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackgroundLibraryDrawer, BackgroundLibraryThumbnail } from './library';
import type { MediaLibraryItem } from '../persistence/media-library/contracts';
import type { GallerySavedView } from '../persistence/gallery-saved-views';

const io = vi.hoisted(() => ({
  list: vi.fn(),
  views: vi.fn(),
  thumbnail: vi.fn(),
  asset: vi.fn(),
}));

vi.mock('../persistence/media-library', () => ({
  listMediaLibrary: io.list,
  getMediaThumbnail: io.thumbnail,
  getMediaAssetBlob: io.asset,
}));
vi.mock('../persistence/gallery-saved-views', () => ({ listGallerySavedViews: io.views }));

let host: HTMLDivElement;
let parent: HTMLDialogElement;
let trigger: HTMLButtonElement;
let root: Root;
let closedWhileConnected: boolean[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  closedWhileConnected = [];
  io.list.mockReset().mockResolvedValue([]);
  io.views.mockReset().mockResolvedValue([]);
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function Surface() {
  const [open, setOpen] = useState(true);
  return open ? (
    <BackgroundLibraryDrawer
      anchor={host}
      busy={false}
      onSelect={vi.fn()}
      onClose={() => setOpen(false)}
    />
  ) : null;
}
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

function image(filename: string, tags: string[]): MediaLibraryItem {
  return {
    id: filename,
    kind: 'image',
    source: { kind: 'screenshot' },
    filename,
    originalFilename: filename,
    createdAt: 1,
    updatedAt: 1,
    size: 100,
    mimeType: 'image/png',
    width: 100,
    height: 100,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags,
    hasThumbnail: false,
  };
}
it('applies composed search after typing settles or Enter and combines a grouped saved filter', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  io.list.mockResolvedValue([image('Sky.png', ['background']), image('Sun.png', [])]);
  const view: GallerySavedView = {
    id: 'backgrounds',
    name: 'Backgrounds',
    folderFilter: 'all',
    createdAt: 1,
    updatedAt: 1,
    filters: {
      activeTags: ['background'],
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
  io.views.mockResolvedValue([view]);
  await act(async () => root.render(<Surface />));
  const input = document.querySelector<HTMLInputElement>(
    '[data-ui="background.library.search"] input'
  )!;
  const setQuery = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const names = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button[title$=".png"]')].map(
      (node) => node.title
    );
  expect(names()).toEqual(['Sky.png', 'Sun.png']);
  await act(async () =>
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  );
  await setQuery('Sky');
  await act(async () => vi.advanceTimersByTime(300));
  expect(names()).toHaveLength(2);
  await act(async () =>
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
  );
  await act(async () => vi.advanceTimersByTime(249));
  expect(names()).toHaveLength(2);
  await act(async () => vi.advanceTimersByTime(1));
  expect(names()).toEqual(['Sky.png']);
  await setQuery('Sun');
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  expect(names()).toEqual(['Sun.png']);
  await setQuery('');
  await act(async () => vi.advanceTimersByTime(250));
  const filter = document.querySelector<HTMLButtonElement>(
    '[data-ui="background.library.filter"] button'
  )!;
  await act(async () => filter.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
    node.textContent?.includes('Backgrounds')
  )!;
  expect(option).toBeTruthy();
  await act(async () => option.click());
  expect(names()).toEqual(['Sky.png']);
  expect(filter.title).toContain('Backgrounds');
  expect(io.list).toHaveBeenCalledTimes(1);
});

it('retains the header after listing failure and retries with image admission', async () => {
  io.list
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([
      image('Sky.png', []),
      { ...image('Movie.mp4', []), kind: 'video' },
      { ...image('Removed.png', []), lifecycle: { storageClass: 'library', trashedAt: 10 } },
    ]);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  await act(async () => root.render(<Surface />));
  const drawer = document.querySelector<HTMLDialogElement>('dialog[aria-label]')!;
  expect(drawer.querySelector('input[type="search"]')).not.toBeNull();
  const retry = [...drawer.querySelectorAll('button')].find((node) =>
    /retry|повторить/i.test(node.textContent ?? '')
  )!;
  expect(retry).toBeTruthy();
  await act(async () => retry.click());
  expect(drawer.querySelector('[title="Sky.png"]')).not.toBeNull();
  expect(drawer.querySelector('[title="Movie.mp4"]')).toBeNull();
  expect(drawer.querySelector('[title="Removed.png"]')).toBeNull();
  expect(io.list).toHaveBeenCalledTimes(2);
});
it('loads a visible fallback thumbnail once and revokes only its owned URL on unmount', async () => {
  let visible!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        visible = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  const create = vi.fn(() => 'blob:thumbnail'),
    revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  io.thumbnail.mockResolvedValue(null);
  const blob = new Blob(['png'], { type: 'image/png' });
  io.asset.mockResolvedValue(blob);
  await act(async () =>
    root.render(<BackgroundLibraryThumbnail mediaId="private-image" fit="contain" />)
  );
  const intersect = (isIntersecting: boolean) =>
    visible([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  await act(async () => intersect(false));
  expect(io.thumbnail).not.toHaveBeenCalled();
  await act(async () => intersect(true));
  expect(io.asset).toHaveBeenCalledWith('private-image');
  expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:thumbnail');
  expect(host.querySelector('img')?.className).toContain('object-contain');
  expect(create).toHaveBeenCalledWith(blob);
  await act(async () => root.render(null));
  expect(revoke).toHaveBeenCalledWith('blob:thumbnail');
  expect(disconnect).toHaveBeenCalled();
});
