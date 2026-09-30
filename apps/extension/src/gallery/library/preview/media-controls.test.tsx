// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { animateMock } = vi.hoisted(() => ({
  animateMock: vi.fn(() => ({ cancel: vi.fn() })),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { PreviewMedia } from './media';
import type { PreviewPanelProps } from './types';
import type { GalleryMediaItem } from '../items';

class PreviewResizeObserverStub {
  observe() {}
  disconnect() {}
}

class PreviewImagePreloaderStub {
  static autoLoad = true;
  static instances: PreviewImagePreloaderStub[] = [];
  naturalHeight = 900;
  naturalWidth = 1600;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  constructor() {
    PreviewImagePreloaderStub.instances.push(this);
  }

  set src(_value: string) {
    if (PreviewImagePreloaderStub.autoLoad) {
      this.complete();
    }
  }

  complete() {
    this.onload?.();
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
    hasChanges: false,
    filenameDraft: 'preview.png',
    tagDraft: '',
    tagDrafts: [],
    onClose: vi.fn(),
    onInspectorToggle: vi.fn(),
    onFilenameChange: vi.fn(),
    onTagDraftChange: vi.fn(),
    onRemoveTag: vi.fn(),
    onAddTag: vi.fn(),
    onResetChanges: vi.fn(),
    onDownload: vi.fn(async () => undefined),
    onDownloadOriginal: vi.fn(async () => undefined),
    onCopy: vi.fn(async () => undefined),
    onEdit: vi.fn(),
    onOpenSnapshotScreenshot: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onRestoreOriginal: vi.fn(),
    onSaveCopy: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderNode(node: ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) {
    throw new Error('Expected native HTMLInputElement value setter');
  }
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', PreviewResizeObserverStub);
  PreviewImagePreloaderStub.autoLoad = true;
  PreviewImagePreloaderStub.instances = [];
  vi.stubGlobal('Image', PreviewImagePreloaderStub);
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animateMock,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.unstubAllGlobals();
});

it.each(['image', 'video'] as const)(
  'keeps %s side navigation below the top controls with either inspector state',
  (kind) => {
    for (const inspectorCollapsed of [false, true]) {
      const item =
        kind === 'video' ? createItem({ kind: 'recording', mimeType: 'video/webm' }) : createItem();
      renderNode(
        <PreviewMedia
          {...createProps({
            item,
            inspectorCollapsed,
            navigation: {
              current: 1,
              total: 2,
              hasPrevious: false,
              hasNext: true,
              onPrevious: vi.fn(),
              onNext: vi.fn(),
            },
          })}
        />
      );
      const toolbar = container?.querySelector('[data-ui="gallery.preview.toolbar"]');
      const content = container?.querySelector('[data-ui="gallery.preview.content-row"]');
      const previous = container?.querySelector(
        '[data-ui="gallery.preview.navigationZone.previous"]'
      );
      expect(toolbar?.nextElementSibling).toBe(content);
      expect(content?.contains(previous ?? null)).toBe(true);
      expect(toolbar?.className).not.toContain('absolute');
    }
  }
);

it('changes image zoom through the slider and preserves it when the lock is enabled', () => {
  const firstItem = createItem({ id: 'first' });
  renderNode(<PreviewMedia {...createProps({ item: firstItem, previewUrl: 'blob:first' })} />);
  const image = container?.querySelector('img');
  if (image) {
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    });
    act(() => image.dispatchEvent(new Event('load')));
  }

  const slider = container?.querySelector<HTMLInputElement>(
    '[data-ui="gallery.preview.zoomSlider"]'
  );
  expect(slider?.type).toBe('range');
  expect(slider?.getAttribute('aria-label')).toBe('gallery.preview.zoomSlider');
  expect(slider?.className).toContain('sniptale-range');
  const lock = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="gallery.preview.zoomLockToggle"]'
  );
  expect(lock?.closest('[data-ui="gallery.preview.zoomSliderGroup"]')).toBe(
    slider?.closest('[data-ui="gallery.preview.zoomSliderGroup"]')
  );
  expect(lock?.tabIndex).toBe(-1);
  const sliderPanel = container?.querySelector<HTMLElement>(
    '[data-ui="gallery.preview.zoomSliderPanel"]'
  );
  expect(sliderPanel?.className).toContain('invisible');
  expect(sliderPanel?.className).toContain('right-0 top-full');
  expect(slider?.tabIndex).toBe(-1);
  expect(slider?.style.getPropertyValue('--sniptale-range-track-height')).toBe('4px');

  const sliderGroup = slider?.closest<HTMLElement>('[data-ui="gallery.preview.zoomSliderGroup"]');
  act(() => sliderGroup?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
  expect(lock?.tabIndex).toBe(0);
  expect(sliderPanel?.className).not.toContain('invisible');
  act(() => sliderGroup?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })));
  expect(lock?.tabIndex).toBe(-1);

  if (!slider) throw new Error('Expected zoom slider');
  act(() => sliderGroup?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
  setInputValue(slider, '1.5');
  expect(lock?.tabIndex).toBe(0);
  expect(slider.valueAsNumber).toBe(1.5);
  expect(slider.getAttribute('aria-valuetext')).toBe('150%');
  expect(container?.textContent).toContain('150%');
  act(() => slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  act(() => sliderGroup?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })));
  expect(sliderPanel?.className).not.toContain('invisible');
  act(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  expect(sliderPanel?.className).toContain('invisible');
  act(() => sliderGroup?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="gallery.preview.zoomLockToggle"]')
      ?.click();
  });
  expect(
    container
      ?.querySelector('button[aria-label="gallery.preview.zoomLockToggle"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(
    container
      ?.querySelector('button[aria-label="gallery.preview.zoomLockToggle"]')
      ?.getAttribute('title')
  ).toBe('gallery.preview.unlockZoom');

  renderNode(
    <PreviewMedia
      {...createProps({ item: createItem({ id: 'second' }), previewUrl: 'blob:second' })}
    />
  );
  expect(container?.textContent).toContain('150%');
  expect(sliderPanel?.className).not.toContain('invisible');
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="gallery.preview.zoomLockToggle"]')
      ?.click();
  });
  expect(container?.textContent).not.toContain('150%');
});

it('keeps the zoom slider open while keyboard focus moves from percent to slider and lock', () => {
  renderNode(<PreviewMedia {...createProps()} />);
  const group = container?.querySelector<HTMLElement>(
    '[data-ui="gallery.preview.zoomSliderGroup"]'
  );
  const trigger = group?.querySelector<HTMLButtonElement>('button[aria-expanded]');
  const slider = group?.querySelector<HTMLInputElement>('[data-ui="gallery.preview.zoomSlider"]');
  const lock = group?.querySelector<HTMLButtonElement>(
    'button[aria-label="gallery.preview.zoomLockToggle"]'
  );
  const panel = group?.querySelector<HTMLElement>('[data-ui="gallery.preview.zoomSliderPanel"]');
  expect(trigger?.className).toContain('w-16');
  expect(panel?.hasAttribute('inert')).toBe(true);

  act(() => {
    trigger?.focus();
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  });
  expect(panel?.hasAttribute('inert')).toBe(false);
  expect(slider?.tabIndex).toBe(0);
  act(() => slider?.focus());
  act(() => group?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })));
  expect(panel?.className).not.toContain('invisible');
  act(() => lock?.focus());
  expect(lock?.tabIndex).toBe(0);
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="common.actions.close"]')
      ?.focus()
  );
  expect(panel?.className).toContain('invisible');
});

it('keeps adjacent navigation in the fixed toolbar and exposes video readiness', () => {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  renderNode(
    <PreviewMedia
      {...createProps({
        item: createItem({ kind: 'recording', mimeType: 'video/webm' }),
        navigation: {
          current: 2,
          total: 3,
          hasPrevious: true,
          hasNext: true,
          onPrevious,
          onNext,
        },
      })}
    />
  );

  const previousButton = container?.querySelector('button[aria-label="gallery.preview.previous"]');
  const nextButton = container?.querySelector('button[aria-label="gallery.preview.next"]');
  expect(previousButton?.className).toContain('border-0 bg-transparent');
  expect(previousButton?.className).toContain('text-[var(--sniptale-color-text-muted-strong)]');
  expect(previousButton?.className).toContain('hover:text-[var(--sniptale-color-text-primary)]');
  expect(container?.querySelector('[data-ui="gallery.preview.toolbar"]')?.textContent).toContain(
    '2 / 3'
  );
  const previousZone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.navigationZone.previous"]'
  );
  const nextZone = container?.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.navigationZone.next"]'
  );
  const viewport = container?.querySelector('[data-ui="preview.media.contained"]')?.parentElement;
  expect(previousZone?.nextElementSibling).toBe(viewport);
  expect(viewport?.nextElementSibling).toBe(nextZone);
  expect(previousZone?.disabled).toBe(false);
  expect(nextZone?.disabled).toBe(false);
  for (const direction of ['previous', 'next']) {
    const rail = container?.querySelector<HTMLElement>(
      `[data-ui="gallery.preview.navigationRail.${direction}"]`
    );
    expect(rail?.getAttribute('aria-hidden')).toBe('true');
    expect(rail?.className).toContain('inset-y-0');
    expect(rail?.className).toContain('pointer-events-none');
  }
  const video = container?.querySelector('video');
  if (video) {
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
  }
  expect(container?.textContent).toContain('2 / 3');
  expect(container?.querySelector('[role="status"]')).not.toBeNull();

  act(() => {
    previousButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    nextButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    video?.dispatchEvent(new Event('loadedmetadata', { bubbles: true }));
  });

  expect(onPrevious).toHaveBeenCalledOnce();
  expect(onNext).toHaveBeenCalledOnce();
  expect(container?.querySelector('[role="status"]')).toBeNull();
});

it('probes local video duration so the full timeline becomes seekable early', () => {
  renderNode(
    <PreviewMedia
      {...createProps({
        item: createItem({ kind: 'recording', mimeType: 'video/webm' }),
      })}
    />
  );

  const video = container?.querySelector('video');
  if (!video) {
    throw new Error('Expected video preview');
  }

  let duration = Number.POSITIVE_INFINITY;
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => duration,
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    value: 0,
    writable: true,
  });

  act(() => video.dispatchEvent(new Event('loadedmetadata', { bubbles: true })));
  expect(video.currentTime).toBe(Number.MAX_SAFE_INTEGER);
  expect(container?.querySelector('[role="status"]')).not.toBeNull();

  duration = 42;
  act(() => video.dispatchEvent(new Event('durationchange', { bubbles: true })));
  expect(video.currentTime).toBe(0);
  expect(container?.querySelector('[role="status"]')).toBeNull();
});

it('keeps the current image visible until the adjacent image is ready and slides it in', () => {
  const firstItem = createItem({ id: 'asset-1', filename: 'first.png' });
  const nextItem = createItem({ id: 'asset-2', filename: 'next.png' });
  const navigation = {
    current: 1,
    total: 2,
    hasPrevious: false,
    hasNext: true,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };

  renderNode(
    <PreviewMedia {...createProps({ item: firstItem, navigation, previewUrl: 'blob:first' })} />
  );
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');

  renderNode(
    <PreviewMedia
      {...createProps({
        item: nextItem,
        navigation: { ...navigation, current: 2, hasPrevious: true, hasNext: false },
        previewUrl: null,
      })}
    />
  );
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');

  animateMock.mockClear();
  PreviewImagePreloaderStub.autoLoad = false;
  renderNode(
    <PreviewMedia
      {...createProps({
        item: nextItem,
        navigation: { ...navigation, current: 2, hasPrevious: true, hasNext: false },
        previewUrl: 'blob:next',
      })}
    />
  );

  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first');
  act(() => PreviewImagePreloaderStub.instances.at(-1)?.complete());
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:next');
  expect(animateMock).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        opacity: 0.82,
        transform: 'translate3d(18px, 0, 0)',
      }),
    ]),
    expect.objectContaining({ duration: 260 })
  );

  renderNode(<PreviewMedia {...createProps({ item: firstItem, navigation, previewUrl: null })} />);
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:next');

  animateMock.mockClear();
  renderNode(
    <PreviewMedia {...createProps({ item: firstItem, navigation, previewUrl: 'blob:first' })} />
  );
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:next');
  act(() => PreviewImagePreloaderStub.instances.at(-1)?.complete());
  expect(animateMock).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ transform: 'translate3d(-18px, 0, 0)' })]),
    expect.objectContaining({ duration: 260 })
  );
});
