// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectItem } from '../actions/test-support';
import type { GalleryMediaItem } from '../items';
import { PreviewPanel } from './index';
import { PreviewMedia } from './media';
import type { PreviewPanelProps } from './types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

class ImagePreloaderStub {
  static deferLoad = false;
  static instances: ImagePreloaderStub[] = [];
  naturalHeight = 900;
  naturalWidth = 1600;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  constructor() {
    ImagePreloaderStub.instances.push(this);
  }
  set src(_value: string) {
    if (!ImagePreloaderStub.deferLoad) this.onload?.();
  }
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createItem(overrides: Partial<GalleryMediaItem> = {}): GalleryMediaItem {
  return {
    id: 'asset-1',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
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
    tags: [],
    hasThumbnail: false,
    type: 'media',
    ...overrides,
  };
}

function createProps(overrides: Partial<PreviewPanelProps> = {}): PreviewPanelProps {
  return {
    item: createItem(),
    previewUrl: 'blob:preview',
    inspectorCollapsed: false,
    filenameDraft: 'preview.png',
    tagDraft: '',
    tagDrafts: [],
    onClose: vi.fn(),
    onInspectorToggle: vi.fn(),
    onFilenameChange: vi.fn(),
    onTagDraftChange: vi.fn(),
    onRemoveTag: vi.fn(),
    onAddTag: vi.fn(),
    onDownload: vi.fn(async () => undefined),
    onCopy: vi.fn(async () => undefined),
    onEdit: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderNode(node: ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(node));
}

beforeEach(() => {
  ImagePreloaderStub.deferLoad = false;
  ImagePreloaderStub.instances = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('Image', ImagePreloaderStub);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

it('retains the old frame without a loading flash until the replacement is ready', () => {
  const item = createItem();
  renderNode(
    <PreviewMedia {...createProps({ item, previewUrl: 'blob:old', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:old');

  ImagePreloaderStub.deferLoad = true;
  renderNode(
    <PreviewMedia {...createProps({ item, previewUrl: 'blob:new', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:old');
  expect(container?.querySelector('[role="status"]')).toBeNull();

  act(() => ImagePreloaderStub.instances.at(-1)?.onload?.());
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:new');
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('delays named loading feedback and clears the old frame on terminal failure', () => {
  vi.useFakeTimers();
  const first = createItem({ id: 'first' });
  const next = createItem({ id: 'next' });
  renderNode(<PreviewMedia {...createProps({ item: first, previewUrl: 'blob:first' })} />);

  renderNode(
    <PreviewMedia
      {...createProps({ item: next, previewUrl: null, previewLoadStatus: 'loading' })}
    />
  );
  expect(container?.querySelector('[role="status"]')).toBeNull();
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');
  act(() => vi.advanceTimersByTime(350));
  expect(container?.querySelector('[role="status"]')?.textContent).toContain(
    'gallery.preview.mediaLoading'
  );
  expect(container?.querySelector('[role="status"]')?.textContent).toContain(next.filename);

  renderNode(
    <PreviewMedia
      {...createProps({ item: next, previewUrl: null, previewLoadStatus: 'missing' })}
    />
  );
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.preview.mediaMissing'
  );
  expect(container?.querySelector('img')).toBeNull();

  renderNode(
    <PreviewMedia {...createProps({ item: next, previewUrl: null, previewLoadStatus: 'error' })} />
  );
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.preview.mediaUnavailable'
  );
});

it('keeps zoom controls in place through delayed loading and unavailable image feedback', () => {
  vi.useFakeTimers();
  const first = createItem({ id: 'first' });
  const next = createItem({ id: 'next' });
  const navigation = {
    current: 1,
    total: 2,
    hasPrevious: false,
    hasNext: true,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };
  renderNode(
    <PreviewMedia
      {...createProps({
        item: first,
        navigation,
        previewUrl: 'blob:first',
        previewLoadStatus: 'ready',
      })}
    />
  );
  const slider = container?.querySelector<HTMLInputElement>(
    '[data-ui="gallery.preview.zoomSlider"]'
  );
  const nextZone = container?.querySelector('[data-ui="gallery.preview.navigationZone.next"]');
  expect(slider).not.toBeNull();

  renderNode(
    <PreviewMedia
      {...createProps({ item: next, navigation, previewUrl: null, previewLoadStatus: 'loading' })}
    />
  );
  expect(container?.querySelector('[data-ui="gallery.preview.zoomSlider"]')).toBe(slider);
  expect(container?.querySelector('[data-ui="gallery.preview.navigationZone.next"]')).toBe(
    nextZone
  );
  expect(slider?.disabled).toBe(true);
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');
  act(() => vi.advanceTimersByTime(350));
  expect(container?.querySelector('[data-ui="gallery.preview.zoomSlider"]')).toBe(slider);
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');

  renderNode(
    <PreviewMedia
      {...createProps({ item: next, navigation, previewUrl: null, previewLoadStatus: 'missing' })}
    />
  );
  expect(container?.querySelector('[data-ui="gallery.preview.zoomSlider"]')).toBe(slider);
  expect(container?.querySelector('[data-ui="gallery.preview.navigationZone.next"]')).toBe(
    nextZone
  );
  expect(slider?.disabled).toBe(true);
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.preview.mediaMissing'
  );
  vi.useRealTimers();
});

it('ignores an obsolete image preload during rapid A to B to C navigation', () => {
  const first = createItem({ id: 'first' });
  const second = createItem({ id: 'second' });
  const third = createItem({ id: 'third' });
  renderNode(
    <PreviewMedia
      {...createProps({ item: first, previewUrl: 'blob:first', previewLoadStatus: 'ready' })}
    />
  );
  const slider = container?.querySelector('[data-ui="gallery.preview.zoomSlider"]');
  ImagePreloaderStub.deferLoad = true;
  renderNode(
    <PreviewMedia
      {...createProps({ item: second, previewUrl: 'blob:second', previewLoadStatus: 'ready' })}
    />
  );
  const secondPreload = ImagePreloaderStub.instances.at(-1);
  renderNode(
    <PreviewMedia
      {...createProps({ item: third, previewUrl: 'blob:third', previewLoadStatus: 'ready' })}
    />
  );
  const thirdPreload = ImagePreloaderStub.instances.at(-1);
  act(() => secondPreload?.onload?.());
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');
  expect(container?.querySelector('[data-ui="gallery.preview.zoomSlider"]')).toBe(slider);
  act(() => thirdPreload?.onload?.());
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:third');
  expect(container?.querySelector('[data-ui="gallery.preview.zoomSlider"]')).toBe(slider);
});

it('reports image decode failure for the current item and clears it for another URL', () => {
  const item = createItem();
  renderNode(
    <PreviewMedia {...createProps({ item, previewUrl: 'blob:bad', previewLoadStatus: 'ready' })} />
  );
  act(() => {
    container?.querySelector('img')?.dispatchEvent(new Event('error', { bubbles: true }));
  });
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.preview.mediaInvalid'
  );
  expect(container?.querySelector('img')).toBeNull();

  renderNode(
    <PreviewMedia {...createProps({ item, previewUrl: 'blob:good', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('[role="alert"]')).toBeNull();
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:good');
});

it('does not flash loading for an immediately decoded first image', () => {
  renderNode(
    <PreviewMedia {...createProps({ previewUrl: 'blob:image', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('[role="status"]')).toBeNull();
  act(() => {
    container?.querySelector('img')?.dispatchEvent(new Event('load', { bubbles: true }));
  });
  expect(container?.querySelector('[data-ui="gallery.preview.mediaStatus"]')).toBeNull();
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:image');
});

it('reports audio decode failure after its blob URL is ready', () => {
  const item = createItem({ kind: 'audio', mimeType: 'audio/webm' });
  renderNode(
    <PreviewMedia
      {...createProps({ item, previewUrl: 'blob:audio', previewLoadStatus: 'ready' })}
    />
  );
  act(() => {
    container?.querySelector('audio')?.dispatchEvent(new Event('error', { bubbles: true }));
  });
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.preview.mediaInvalid'
  );
  expect(container?.querySelector('audio')).toBeNull();
});

it('does not show media loading feedback for a project preview without a blob URL', () => {
  renderNode(
    <PreviewMedia {...createProps({ item: createVideoProjectItem(), previewUrl: null })} />
  );
  expect(container?.querySelector('[data-ui="gallery.preview.mediaStatus"]')).toBeNull();
});

it('prepares the actual next video without resetting the current player or autoplaying', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const first = createItem({ id: 'video-a', kind: 'video', mimeType: 'video/webm' });
  const second = createItem({ id: 'video-b', kind: 'video', mimeType: 'video/webm' });
  const onPresented = vi.fn();
  renderNode(<PreviewMedia {...createProps({ item: first, previewUrl: 'blob:a', onPresented })} />);
  const current = container?.querySelector('video');
  expect(current?.preload).toBe('auto');
  act(() => current?.dispatchEvent(new Event('loadeddata')));
  if (current) current.currentTime = 7;
  renderNode(
    <PreviewMedia {...createProps({ item: second, previewUrl: 'blob:b', onPresented })} />
  );
  const next = container?.querySelector<HTMLVideoElement>('video[src="blob:b"]');
  expect(container?.querySelector('video[src="blob:a"]')).toBe(current);
  expect(current?.currentTime).toBe(7);
  expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  expect(next?.closest('[inert]')).not.toBeNull();
  act(() => next?.dispatchEvent(new Event('loadedmetadata')));
  expect(container?.querySelector('video[src="blob:a"]')).toBe(current);
  act(() => next?.dispatchEvent(new Event('loadeddata')));
  expect(container?.querySelector('video')).toBe(next);
  expect(next?.closest('[inert]')).toBeNull();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
  expect(play).not.toHaveBeenCalled();
  expect(onPresented).toHaveBeenLastCalledWith({
    requestRevision: 0,
    url: 'blob:b',
    outcome: 'presented',
  });
});

it('blocks requested-item actions and retained-frame zoom until presentation or terminal feedback', () => {
  const first = createItem({ id: 'a' });
  const next = createItem({ id: 'b' });
  renderNode(
    <PreviewPanel
      {...createProps({ item: first, previewUrl: 'blob:a', previewRequestRevision: 1 })}
    />
  );
  expect(
    container?.querySelector('[data-ui="gallery.preview.inspector"]')?.hasAttribute('inert')
  ).toBe(false);
  ImagePreloaderStub.deferLoad = true;
  renderNode(
    <PreviewPanel
      {...createProps({ item: next, previewUrl: 'blob:b', previewRequestRevision: 2 })}
    />
  );
  const inspector = container?.querySelector('[data-ui="gallery.preview.inspector"]');
  expect(inspector?.hasAttribute('inert')).toBe(true);
  const image = container?.querySelector('img');
  const style = image?.getAttribute('style');
  act(() =>
    image?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, ctrlKey: true, deltaY: -240 }))
  );
  expect(image?.getAttribute('style')).toBe(style);
  act(() => ImagePreloaderStub.instances.at(-1)?.onerror?.());
  expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
    'gallery.preview.mediaInvalid'
  );
  expect(inspector?.hasAttribute('inert')).toBe(false);
  expect(container?.querySelector('img')).toBeNull();
});

it('keeps first-open loading quiet, ignores late readiness after close, and respects reduced motion', () => {
  vi.useFakeTimers();
  ImagePreloaderStub.deferLoad = true;
  const onPresented = vi.fn();
  renderNode(<PreviewMedia {...createProps({ onPresented })} />);
  expect(container?.querySelector('img')).toBeNull();
  expect(container?.querySelector('[role="status"]')).toBeNull();
  act(() => vi.advanceTimersByTime(350));
  expect(container?.querySelector('[role="status"]')?.textContent).toContain(
    'gallery.preview.mediaLoading'
  );
  const lateLoad = ImagePreloaderStub.instances.at(-1)?.onload;
  renderNode(null);
  act(() => lateLoad?.());
  expect(onPresented).not.toHaveBeenCalled();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const animate = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  ImagePreloaderStub.deferLoad = false;
  renderNode(<PreviewMedia {...createProps()} />);
  expect(animate).not.toHaveBeenCalled();
  delete HTMLElement.prototype.animate;
});
