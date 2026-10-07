// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MusicLibraryDrawer, type MusicLibraryDrawerProps } from './music-library';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';

const io = vi.hoisted(() => ({ media: vi.fn(), views: vi.fn() }));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.media }));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: io.views,
}));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
const item: MediaLibraryItem = {
  id: 'song',
  kind: 'audio',
  filename: 'Long song.wav',
  originalFilename: 'Long song.wav',
  createdAt: 1,
  updatedAt: 1,
  mimeType: 'audio/wav',
  size: 10,
  width: null,
  height: null,
  duration: 92,
  source: { kind: 'project-asset', projectAssetId: 'asset' },
  tags: [],
  sourceUrl: null,
  sourceTitle: null,
  sourceFavicon: null,
  hasThumbnail: false,
};
let root: Root;
let host: HTMLDivElement;
let props: MusicLibraryDrawerProps;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.media.mockResolvedValue([item]);
  io.views.mockResolvedValue([]);
  props = {
    anchor: host,
    onClose: vi.fn(),
    onSelect: vi.fn().mockResolvedValue(undefined),
    onUpload: vi.fn().mockResolvedValue(undefined),
    onPreview: vi.fn().mockResolvedValue(undefined),
    onStopPreview: vi.fn(),
    playingId: null,
    loadingId: null,
    unavailable: () => null,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<MusicLibraryDrawer {...props} />));
}
function button(label: string) {
  const node = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === label
  );
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}

it('keeps listening separate from insertion and exposes filename and metadata', async () => {
  await render();
  await act(async () => button('gallery.videoReview.musicPlay: Long song.wav').click());
  expect(props.onPreview).toHaveBeenCalledExactlyOnceWith('song');
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(document.querySelector('[data-ui="music.library.list"]')?.textContent).toContain('01:32');
  expect(document.querySelector('[title="Long song.wav"]')).not.toBeNull();
  props.playingId = 'song';
  await render();
  await act(async () => button('gallery.videoReview.musicStop: Long song.wav').click());
  expect(props.onStopPreview).toHaveBeenCalledTimes(1);
});

it('rejects duplicate insertion, allows closing while pending and retains the row on failure', async () => {
  let reject!: (error: Error) => void;
  props.onSelect = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  await render();
  const add = button('gallery.videoReview.musicAdd: Long song.wav');
  act(() => {
    add.click();
    add.click();
  });
  expect(props.onSelect).toHaveBeenCalledTimes(1);
  expect(add.disabled).toBe(true);
  act(() => button('common.actions.close').click());
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('private storage detail')));
  expect(add.disabled).toBe(false);
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.videoReview.musicFailed'
  );
  expect(document.body.textContent).not.toContain('private storage detail');
  expect(document.querySelector('[title="Long song.wav"]')).not.toBeNull();
});

it('isolates modal keyboard events and routes native cancellation', async () => {
  await render();
  const listener = vi.fn();
  window.addEventListener('keydown', listener);
  const search = document.querySelector('input[type="search"]')!;
  for (const key of [' ', 'Enter', 'Escape']) {
    act(() => search.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  }
  expect(listener).not.toHaveBeenCalled();
  const cancellation = new Event('cancel', { cancelable: true });
  act(() => document.querySelector('dialog')!.dispatchEvent(cancellation));
  expect(cancellation.defaultPrevented).toBe(true);
  expect(props.onClose).toHaveBeenCalledTimes(1);
  window.removeEventListener('keydown', listener);
});

it('supports upload retry and leaves file-dialog cancellation without changes', async () => {
  props.onUpload = vi.fn().mockRejectedValue(new Error('failure'));
  await render();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input.accept).toBe('audio/*');
  expect(input.multiple).toBe(false);
  act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(props.onUpload).not.toHaveBeenCalled();
  const file = new File(['audio'], 'song.wav', { type: 'audio/wav' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(input.value).toBe('');
  }
  expect(props.onUpload).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[title="Long song.wav"]')).not.toBeNull();
});

it('shows a metadata admission reason and preserves header controls on list failure', async () => {
  props.unavailable = () => 'Too long';
  await render();
  expect(button('gallery.videoReview.musicAdd: Long song.wav').disabled).toBe(true);
  expect(document.body.textContent).toContain('Too long');
  await act(async () => root.unmount());
  root = createRoot(host);
  io.media.mockRejectedValue(new Error('storage'));
  await render();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.videoReview.musicListFailed'
  );
  expect(button('gallery.videoReview.musicUpload').disabled).toBe(false);
  expect(button('common.actions.close').disabled).toBe(false);
});
