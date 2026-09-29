// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectItem } from '../actions/test-support';
import type { GalleryMediaItem } from '../items';
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
});

it('hides the old frame until a new URL for the same item finishes preloading', () => {
  const item = createItem();
  renderNode(
    <PreviewMedia {...createProps({ item, previewUrl: 'blob:old', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:old');

  ImagePreloaderStub.deferLoad = true;
  renderNode(
    <PreviewMedia {...createProps({ item, previewUrl: 'blob:new', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('img')).toBeNull();
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.preview.mediaLoading'
  );

  act(() => ImagePreloaderStub.instances.at(-1)?.onload?.());
  expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:new');
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows item-scoped loading, missing, and load-error feedback without an old media frame', () => {
  const first = createItem({ id: 'first' });
  const next = createItem({ id: 'next' });
  renderNode(<PreviewMedia {...createProps({ item: first, previewUrl: 'blob:first' })} />);

  renderNode(
    <PreviewMedia
      {...createProps({ item: next, previewUrl: null, previewLoadStatus: 'loading' })}
    />
  );
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.preview.mediaLoading'
  );
  expect(container?.querySelector('img')).toBeNull();

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

it('clears image loading feedback when the current image renders', () => {
  renderNode(
    <PreviewMedia {...createProps({ previewUrl: 'blob:image', previewLoadStatus: 'ready' })} />
  );
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(
    'gallery.preview.mediaLoading'
  );
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
