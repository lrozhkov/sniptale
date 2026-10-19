// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioLibrarySelection, type AudioLibrarySelectionValue } from './selection';
import { readLibraryAudioBindingSource } from '../persistence/projects/library-asset-binding';
import type { MediaLibraryItem } from '../persistence/media-library/contracts';
const io = vi.hoisted(() => ({ media: vi.fn(), views: vi.fn(), read: vi.fn() }));
vi.mock('../persistence/media-library', () => ({ listMediaLibrary: io.media }));
vi.mock('../persistence/gallery-saved-views', () => ({ listGallerySavedViews: io.views }));
vi.mock('../persistence/projects/library-asset-binding', () => ({
  readLibraryAudioBindingSource: io.read,
}));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
const item: MediaLibraryItem = {
  id: 'selected',
  kind: 'audio',
  filename: 'Original.wav',
  originalFilename: 'Original.wav',
  createdAt: 1,
  updatedAt: 1,
  mimeType: 'audio/wav',
  size: 4,
  width: null,
  height: null,
  duration: 2,
  source: { kind: 'stored-asset', assetId: 'original' },
  tags: [],
  sourceUrl: null,
  sourceTitle: null,
  sourceFavicon: null,
  hasThumbnail: false,
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let select: ReturnType<typeof vi.fn<(selection: AudioLibrarySelectionValue) => Promise<void>>>;
let beforePreview: ReturnType<typeof vi.fn<() => void>>;
let close: ReturnType<typeof vi.fn<() => void>>;
beforeEach(() => {
  vi.resetAllMocks();
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
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audition');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  select = vi.fn(async () => undefined);
  beforePreview = vi.fn();
  close = vi.fn();
  io.media.mockResolvedValue([item]);
  io.views.mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function mount() {
  await act(async () =>
    root.render(
      <AudioLibrarySelection
        onSelect={select}
        onClose={close}
        onBeforePreview={beforePreview}
        trigger={(open) => <button onClick={open}>Choose</button>}
      />
    )
  );
  await click('Choose');
}
it('ignores late audition after dismissal', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof readLibraryAudioBindingSource>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof readLibraryAudioBindingSource>>>((done) => {
    resolve = done;
  });
  io.read.mockReturnValueOnce(pending);
  await mount();
  await click('gallery.videoReview.musicPlay: Original.wav');
  expect(beforePreview).toHaveBeenCalledOnce();
  await click('common.actions.close');
  expect(close).toHaveBeenCalledOnce();
  await act(async () =>
    resolve({
      mediaId: 'selected',
      filename: 'Original.wav',
      file: new File(['data'], 'Original.wav', { type: 'audio/wav' }),
      source: item.source,
      entry: null,
      ref: {
        assetId: 'original',
        createdAt: 1,
        mimeType: 'audio/wav',
        size: 4,
        sha256: null,
        location: { kind: 'opfs', objectKey: 'original' },
      },
    })
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
it('keeps the picker and selected file available after preparation refusal', async () => {
  await mount();
  select.mockRejectedValueOnce(new Error('decode refused'));
  await click('gallery.videoReview.musicAdd: Original.wav');
  expect(document.querySelector('dialog')).not.toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.videoReview.musicFailed'
  );
  await click('gallery.videoReview.musicAdd: Original.wav');
  expect(select).toHaveBeenLastCalledWith({ kind: 'library', id: 'selected' });
  expect(document.querySelector('dialog')).toBeNull();
});

it.each(['read', 'play'] as const)(
  'recovers from an audition %s failure without accepting audio',
  async (stage) => {
    const pause = vi.fn();
    vi.stubGlobal(
      'Audio',
      class {
        onended: (() => void) | null = null;
        pause = pause;
        async play() {
          throw new Error('private playback detail');
        }
      }
    );
    const source: Awaited<ReturnType<typeof readLibraryAudioBindingSource>> = {
      mediaId: 'selected',
      filename: 'Original.wav',
      file: new File(['data'], 'Original.wav', { type: 'audio/wav' }),
      source: item.source,
      entry: null,
      ref: {
        assetId: 'original',
        createdAt: 1,
        mimeType: 'audio/wav',
        size: 4,
        sha256: null,
        location: { kind: 'opfs', objectKey: 'original' },
      },
    };
    if (stage === 'read') io.read.mockRejectedValueOnce(new Error('private storage detail'));
    else io.read.mockResolvedValueOnce(source);
    await mount();
    await click('gallery.videoReview.musicPlay: Original.wav');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'gallery.videoReview.musicFailed'
    );
    expect(document.body.textContent).not.toContain('private');
    expect(select).not.toHaveBeenCalled();
    const play = document.querySelector<HTMLButtonElement>(
      '[aria-label="gallery.videoReview.musicPlay: Original.wav"]'
    )!;
    expect(play.disabled).toBe(false);
    if (stage === 'play') {
      expect(pause).toHaveBeenCalledOnce();
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:audition');
    } else expect(URL.createObjectURL).not.toHaveBeenCalled();
    await click('gallery.videoReview.musicAdd: Original.wav');
    expect(select).toHaveBeenCalledOnce();
    expect(document.querySelector('dialog')).toBeNull();
  }
);

it('disables audition and preparation for an oversized Library source', async () => {
  io.media.mockResolvedValueOnce([{ ...item, size: 65 * 1024 * 1024 }]);
  await mount();
  expect(document.body.textContent).toContain('gallery.videoReview.musicTooLarge');
  for (const label of [
    'gallery.videoReview.musicPlay: Original.wav',
    'gallery.videoReview.musicAdd: Original.wav',
  ]) {
    const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    expect(button.disabled).toBe(true);
    await act(async () => button.click());
  }
  expect(io.read).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
