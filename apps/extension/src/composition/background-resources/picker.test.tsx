// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  bundled: vi.fn(),
  library: vi.fn(),
  prepare: vi.fn(),
  list: vi.fn(),
  thumb: vi.fn(),
  blob: vi.fn(),
  views: vi.fn(),
}));
vi.mock('./catalog', () => ({
  useBackgroundCatalog: () => ({
    status: 'ready',
    presets: [
      { id: 'built', name: 'Built', enabled: true, available: true, url: '/bg.png' },
      { id: 'custom', name: 'Custom', mediaId: 'image', enabled: true, available: true },
      { id: 'off', name: 'Disabled', enabled: false, available: true },
    ],
  }),
}));
vi.mock('./acquisition', () => ({
  readBundledBackground: io.bundled,
  readLibraryBackground: io.library,
}));
vi.mock('../../workflows/background-images/intake', () => ({
  BACKGROUND_IMAGE_ACCEPT: 'image/png,image/svg+xml',
  prepareBackgroundImage: io.prepare,
}));
vi.mock('../persistence/media-library', () => ({
  listMediaLibrary: io.list,
  getMediaThumbnail: io.thumb,
  getMediaAssetBlob: io.blob,
}));
vi.mock('../persistence/gallery-saved-views', () => ({ listGallerySavedViews: io.views }));
import { BackgroundImagePicker } from './picker';
import { translate } from '../../platform/i18n';
let host: HTMLDivElement;
let root: Root;
let visible: IntersectionObserverCallback;
const revoke = vi.fn();
const disconnect = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: revoke })
  );
  const file = new File(['image'], 'bg.png', { type: 'image/png' });
  io.bundled.mockResolvedValue({ file });
  io.library.mockResolvedValue({ file, originMediaId: 'image' });
  io.prepare.mockResolvedValue(file);
  io.thumb.mockResolvedValue({ blob: file });
  io.views.mockResolvedValue([]);
  io.list.mockResolvedValue([{ id: 'image', kind: 'image', filename: 'My image.png' }]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(name: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name
  );
  expect(button).toBeTruthy();
  await act(async () => button?.click());
}
it('applies enabled presets and validates local uploads before commit', async () => {
  const select = vi.fn();
  await act(async () => root.render(<BackgroundImagePicker onSelect={select} />));
  expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(2);
  await click('Built');
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({ file: expect.any(File) }),
    expect.any(AbortSignal)
  );
  await click('Custom');
  expect(io.library).toHaveBeenCalledWith('image', expect.any(AbortSignal));
  await click(translate('settings.editor.backgrounds.upload'));
  const input = host.querySelector('input')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['svg'], 'bg.svg')],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(io.prepare).toHaveBeenCalledOnce();
  expect(input.value).toBe('');
});
it('shows acquisition errors, and aborts pending work on unmount without committing', async () => {
  const select = vi.fn();
  io.bundled.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => root.render(<BackgroundImagePicker onSelect={select} />));
  await click('Built');
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Built"]')?.getAttribute('aria-busy')).toBe('false');
  expect(host.querySelector('[role=status]')).toBeNull();
  let resolve!: (image: { file: File }) => void;
  io.bundled.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await click('Built');
  await act(async () => root.unmount());
  await act(async () => resolve({ file: new File(['x'], 'bg.png') }));
  expect(select).not.toHaveBeenCalled();
  root = createRoot(host);
});
it('selects from Library, filters search, owns thumbnail URLs and closes the drawer', async () => {
  const select = vi.fn();
  await act(async () => root.render(<BackgroundImagePicker onSelect={select} />));
  await click(translate('settings.editor.backgrounds.library'));
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  await act(async () =>
    visible([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver)
  );
  expect(document.querySelector('img[src="blob:preview"]')).not.toBeNull();
  const search = document.querySelector('input[type=search]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      search,
      'absent'
    );
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(document.querySelector('button[title="My image.png"]')).toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'My');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('My image.png');
  expect(select).toHaveBeenCalled();
  expect(document.querySelector('dialog')).toBeNull();
  expect(revoke).toHaveBeenCalled();
});
it.each(['list', 'views'] as const)(
  'retries failed %s reads, shows empty results, and dismisses with native cancel',
  async (source) => {
    io.list.mockResolvedValue([]);
    io[source].mockRejectedValueOnce(new Error('unavailable'));
    await act(async () =>
      root.render(<BackgroundImagePicker onSelect={vi.fn()} showPresets={false} />)
    );
    await click(translate('settings.editor.backgrounds.library'));
    await click(translate('settings.editor.backgrounds.retry'));
    expect(document.body.textContent).toContain(translate('settings.editor.backgrounds.empty'));
    await act(async () =>
      document.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }))
    );
    expect(document.querySelector('dialog')).toBeNull();
  }
);

it('combines image saved filters with search and clears empty results without changing Library', async () => {
  const filters = {
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
  };
  io.views.mockResolvedValue([
    { id: 'image', name: 'Backgrounds', folderFilter: 'screenshot', filters },
    { id: 'all', name: 'All backgrounds', folderFilter: 'all', filters },
    { id: 'video', name: 'Video only', folderFilter: 'recording', filters },
  ]);
  io.list.mockResolvedValue([
    { id: 'blue', kind: 'image', filename: 'Blue.png', tags: ['background'] },
    { id: 'red', kind: 'screenshot', filename: 'Red.png', tags: [] },
  ]);
  await act(async () => root.render(<BackgroundImagePicker onSelect={vi.fn()} />));
  await click(translate('settings.editor.backgrounds.library'));
  const filter = document.querySelector('select')!;
  expect([...filter.options].map((option) => option.text)).toEqual([
    translate('settings.editor.backgrounds.allImages'),
    'Backgrounds',
    'All backgrounds',
  ]);
  await act(async () => {
    filter.value = 'image';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(document.querySelector('button[title="Blue.png"]')).not.toBeNull();
  expect(document.querySelector('button[title="Red.png"]')).toBeNull();
  const search = document.querySelector('input[type=search]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'Red');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(document.body.textContent).toContain(translate('settings.editor.backgrounds.noResults'));
  await act(async () => {
    filter.value = '';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(document.querySelector('button[title="Red.png"]')).not.toBeNull();
});

it('keeps loading on the chosen thumbnail through acquisition and parent import', async () => {
  let resolve!: (image: { file: File }) => void;
  io.bundled.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const select = vi.fn();
  await act(async () => root.render(<BackgroundImagePicker onSelect={select} />));
  await click('Built');
  const chosen = host.querySelector('[aria-label="Built"]')!;
  expect(chosen.getAttribute('aria-busy')).toBe('true');
  expect(chosen.querySelector('[role="status"]')).not.toBeNull();
  await click('Custom');
  expect(io.library).not.toHaveBeenCalled();
  await act(async () => {
    root.render(<BackgroundImagePicker onSelect={select} pending />);
    resolve({ file: new File(['x'], 'bg.png') });
  });
  expect(select).toHaveBeenCalledOnce();
  expect(chosen.getAttribute('aria-busy')).toBe('true');
  await act(async () => root.render(<BackgroundImagePicker onSelect={select} pending={false} />));
  expect(chosen.getAttribute('aria-busy')).toBe('false');
  expect(chosen.querySelector('[role="status"]')).toBeNull();
});
