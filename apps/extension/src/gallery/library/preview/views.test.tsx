// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioExportItem, createVideoProjectItem } from '../actions/test-support/index';

const { animateMock, formatBytesMock, translateMock } = vi.hoisted(() => ({
  animateMock: vi.fn(() => ({ cancel: vi.fn() })),
  formatBytesMock: vi.fn(() => '2.00 KB'),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: vi.fn(() => '31 Mar 2026'),
  getCurrentLocale: vi.fn(() => 'en'),
  translate: translateMock,
}));

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatBytes: formatBytesMock,
}));

import { PreviewMedia } from './media';
import { PreviewActions, PreviewMetadataCards, PreviewTagEditor } from './sidebar-sections';
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

function renderInteractivePreviewActions(props: Partial<PreviewPanelProps>) {
  renderNode(
    <>
      <PreviewTagEditor
        onAddTag={props.onAddTag ?? vi.fn()}
        onRemoveTag={props.onRemoveTag ?? vi.fn()}
        onTagDraftChange={props.onTagDraftChange ?? vi.fn()}
        tagDraft={props.tagDraft ?? 'draft'}
        tagDrafts={['alpha']}
      />
      <PreviewActions {...createProps({ hasChanges: true, ...props })} />
    </>
  );
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

it('renders media previews for image, video, audio, and empty states', () => {
  const imageMarkup = renderToStaticMarkup(
    <PreviewMedia {...createProps({ previewUrl: 'blob:image' })} />
  );
  const videoMarkup = renderToStaticMarkup(
    <PreviewMedia
      {...createProps({
        item: createItem({ kind: 'recording', mimeType: 'video/webm' }),
        previewUrl: 'blob:video',
      })}
    />
  );
  const audioMarkup = renderToStaticMarkup(
    <PreviewMedia
      {...createProps({
        item: createItem({ kind: 'audio', mimeType: 'audio/mpeg' }),
        previewUrl: 'blob:audio',
      })}
    />
  );
  const emptyMarkup = renderToStaticMarkup(
    <PreviewMedia
      {...createProps({
        item: createItem(),
        previewUrl: null,
      })}
    />
  );
  const videoProjectMarkup = renderToStaticMarkup(
    <PreviewMedia
      {...createProps({
        item: createVideoProjectItem({ id: 'video-project:project-1' }),
        previewUrl: null,
      })}
    />
  );

  expect(imageMarkup).toContain('<img');
  expect(imageMarkup).toContain('data-ui="preview.media.scrollable"');
  expect(imageMarkup).not.toContain('rounded-[16px]');
  expect(imageMarkup).toContain('max-h-none max-w-none');
  expect(imageMarkup).not.toContain('max-h-full max-w-full shrink-0 select-none object-contain');
  expect(videoMarkup).toContain('<video');
  expect(videoMarkup).toContain('data-ui="preview.media.contained"');
  expect(videoMarkup).toContain('preload="metadata"');
  expect(videoMarkup).toContain(
    'class="block h-auto max-h-full w-auto max-w-full bg-black object-contain"'
  );
  expect(videoMarkup).toContain('gallery.preview.videoLoading');
  expect(audioMarkup).toContain('<audio');
  expect(videoProjectMarkup).toContain('lucide-video');
  expect(emptyMarkup).not.toContain('<img');
  expect(emptyMarkup).not.toContain('<video');
  expect(emptyMarkup).not.toContain('<audio');
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

it('renders metadata cards, fallback values, and tag editor states', () => {
  const metadataMarkup = renderToStaticMarkup(
    <PreviewMetadataCards item={createItem({ duration: 3.4 })} />
  );
  const fallbackMetadataMarkup = renderToStaticMarkup(
    <PreviewMetadataCards
      item={createItem({
        mimeType: '',
        width: null,
        height: null,
        duration: null,
      })}
    />
  );
  const emptyTagMarkup = renderToStaticMarkup(
    <PreviewTagEditor
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onTagDraftChange={vi.fn()}
      tagDraft=""
      tagDrafts={[]}
    />
  );
  const tagMarkup = renderToStaticMarkup(
    <PreviewTagEditor
      onAddTag={vi.fn()}
      onRemoveTag={vi.fn()}
      onTagDraftChange={vi.fn()}
      tagDraft="draft"
      tagDrafts={['alpha', 'beta']}
    />
  );

  expect(metadataMarkup).toContain('gallery.preview.size');
  expect(metadataMarkup).toContain('2.00 KB');
  expect(metadataMarkup).toContain('1280×720');
  expect(metadataMarkup).toContain('3.4 gallery.preview.durationSuffix');
  expect(fallbackMetadataMarkup).toContain('—');
  expect(emptyTagMarkup).toContain('gallery.preview.tagsEmpty');
  expect(tagMarkup).toContain('alpha ×');
  expect(tagMarkup).toContain('beta ×');
});

it('renders image-only actions conditionally', () => {
  const imageMarkup = renderToStaticMarkup(<PreviewActions {...createProps()} />);
  const editedImageMarkup = renderToStaticMarkup(
    <PreviewActions
      {...createProps({ item: createItem({ imageContentState: 'edited', workspaceRevision: 1 }) })}
    />
  );
  const videoMarkup = renderToStaticMarkup(
    <PreviewActions
      {...createProps({
        item: createItem({ kind: 'recording', mimeType: 'video/webm' }),
      })}
    />
  );

  expect(imageMarkup).toContain('gallery.preview.openInEditor');
  expect(imageMarkup).toContain('gallery.preview.copy');
  expect(imageMarkup).toContain('gallery.preview.download');
  expect(imageMarkup).not.toContain('gallery.preview.downloadOriginal');
  expect(imageMarkup).not.toContain('gallery.preview.restoreOriginal');
  expect(imageMarkup).toContain('gallery.preview.saveCopy');
  expect(editedImageMarkup).toContain('gallery.preview.downloadOriginal');
  expect(editedImageMarkup).toContain('gallery.preview.restoreOriginal');
  expect(imageMarkup).toContain('gallery.preview.actions');
  expect(imageMarkup).toContain('gallery.preview.fileActions');
  expect(imageMarkup).not.toContain('gallery.preview.changeActions');
  expect(editedImageMarkup).toContain('gallery.preview.changeActions');
  expect(imageMarkup).not.toContain('grid-cols-2');
  expect(imageMarkup).toContain('border-none');
  expect(imageMarkup).toContain('h-10 min-h-10');
  expect(videoMarkup).not.toContain('gallery.preview.openInEditor');
  expect(videoMarkup).not.toContain('gallery.preview.copy');
  const backingImageMarkup = renderToStaticMarkup(
    <PreviewActions
      {...createProps({
        item: createItem({ source: { kind: 'project-asset', projectAssetId: 'asset-1' } }),
      })}
    />
  );
  expect(backingImageMarkup).not.toContain('gallery.preview.downloadOriginal');
  expect(backingImageMarkup).not.toContain('gallery.preview.restoreOriginal');
  expect(backingImageMarkup).not.toContain('gallery.preview.saveCopy');
});

it('hides destructive and reset actions for scenario exports without pending changes', () => {
  const previewProps = createProps({
    item: createScenarioExportItem({
      filename: 'scenario-export.zip',
      project: {
        id: 'project-1',
        name: 'Quarterly Demo',
        createdAt: 1,
        updatedAt: 1,
      },
    }),
    hasChanges: false,
  });
  const { onResetChanges: _onResetChanges, ...exportProps } = previewProps;
  const exportMarkup = renderToStaticMarkup(<PreviewActions {...exportProps} />);

  expect(exportMarkup).not.toContain('gallery.preview.resetChanges');
  expect(exportMarkup).not.toContain('gallery.preview.download');
});

it('wires interactive preview actions and tag editing handlers', () => {
  const onAddTag = vi.fn();
  const onRemoveTag = vi.fn();
  const onTagDraftChange = vi.fn();
  const onResetChanges = vi.fn();
  const onDownload = vi.fn(async () => undefined);
  const onCopy = vi.fn(async () => undefined);
  const onEdit = vi.fn();
  const onDelete = vi.fn(async () => undefined);
  renderInteractivePreviewActions({
    onAddTag,
    onCopy,
    onDelete,
    onDownload,
    onEdit,
    onRemoveTag,
    onResetChanges,
    onTagDraftChange,
  });
  const input = container?.querySelector('input');
  if (!input) {
    throw new Error('Expected preview tag input');
  }

  setInputValue(input, 'updated');
  renderInteractivePreviewActions({
    onAddTag,
    onCopy,
    onDelete,
    onDownload,
    onEdit,
    onRemoveTag,
    onResetChanges,
    onTagDraftChange,
    tagDraft: 'updated',
  });
  const updatedInput = container?.querySelector('input');
  const updatedButtons = Array.from(container?.querySelectorAll('button') ?? []);
  if (!(updatedInput instanceof HTMLInputElement)) {
    throw new Error('Expected updated preview tag input');
  }
  act(() => {
    updatedInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    updatedButtons.forEach((button) => button.click());
  });

  expect(onTagDraftChange).toHaveBeenCalledWith('updated');
  expect(onRemoveTag).toHaveBeenCalledWith('alpha');
  expect(onAddTag).toHaveBeenCalledTimes(1);
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(onResetChanges).toHaveBeenCalledTimes(1);
  expect(onDownload).toHaveBeenCalledTimes(1);
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(onDelete).toHaveBeenCalledTimes(1);
});
