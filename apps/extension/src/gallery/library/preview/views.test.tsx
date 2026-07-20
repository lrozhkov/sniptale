// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioExportItem, createVideoProjectItem } from '../actions/test-support/index';

const { formatBytesMock, translateMock } = vi.hoisted(() => ({
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

import { PreviewActions, PreviewMedia, PreviewMetadataCards, PreviewTagEditor } from './views';
import type { PreviewPanelProps } from './types';
import type { GalleryMediaItem } from '../items';
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
    onCopy: vi.fn(async () => undefined),
    onEdit: vi.fn(),
    onOpenSnapshotScreenshot: vi.fn(async () => undefined),
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
        tagDraft="draft"
        tagDrafts={['alpha']}
      />
      <PreviewActions {...createProps({ hasChanges: true, ...props })} />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
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
  expect(videoMarkup).toContain('<video');
  expect(audioMarkup).toContain('<audio');
  expect(videoProjectMarkup).toContain('lucide-video');
  expect(emptyMarkup).not.toContain('<img');
  expect(emptyMarkup).not.toContain('<video');
  expect(emptyMarkup).not.toContain('<audio');
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
  const videoMarkup = renderToStaticMarkup(
    <PreviewActions
      {...createProps({
        item: createItem({ kind: 'recording', mimeType: 'video/webm' }),
      })}
    />
  );

  expect(imageMarkup).toContain('gallery.preview.openInEditor');
  expect(imageMarkup).toContain('gallery.preview.copy');
  expect(imageMarkup).toContain('border-none');
  expect(imageMarkup).toContain('h-10 min-h-10');
  expect(videoMarkup).not.toContain('gallery.preview.openInEditor');
  expect(videoMarkup).not.toContain('gallery.preview.copy');
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
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  if (!input) {
    throw new Error('Expected preview tag input');
  }

  setInputValue(input, 'updated');
  act(() => {
    buttons.forEach((button) => button.click());
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
