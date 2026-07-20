// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PreviewActions, PreviewMedia } from './views';
import type { PreviewPanelProps } from './types';
import type { GalleryMediaItem } from '../items';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: vi.fn(() => '31 Mar 2026'),
  getCurrentLocale: vi.fn(() => 'en'),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatBytes: vi.fn(() => '2.00 KB'),
}));

function createWebSnapshotItem(): GalleryMediaItem {
  return {
    id: 'asset-web',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    filename: 'snapshot.zip',
    originalFilename: 'snapshot.zip',
    createdAt: 1,
    updatedAt: 2,
    size: 2048,
    mimeType: 'application/zip',
    width: 1280,
    height: 720,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    hasThumbnail: true,
    type: 'media',
  };
}

function createProps(): PreviewPanelProps {
  return {
    item: createWebSnapshotItem(),
    previewUrl: 'blob:snapshot-preview',
    inspectorCollapsed: false,
    hasChanges: false,
    filenameDraft: 'snapshot.zip',
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
  };
}

it('renders the saved page screenshot as the web snapshot preview', () => {
  const markup = renderToStaticMarkup(<PreviewMedia {...createProps()} />);

  expect(markup).toContain('<img');
  expect(markup).toContain('blob:snapshot-preview');
});

it('renders web snapshot actions without image copy affordances', () => {
  const markup = renderToStaticMarkup(<PreviewActions {...createProps()} />);

  expect(markup).toContain('gallery.preview.openSnapshot');
  expect(markup).toContain('gallery.preview.openSnapshotScreenshotInEditor');
  expect(markup).toContain('gallery.preview.download');
  expect(markup).toContain('common.actions.delete');
  expect(markup).not.toContain('gallery.preview.copy');
  expect(markup).not.toContain('gallery.preview.openInEditor');
});
