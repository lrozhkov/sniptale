// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioExportItem,
  createVideoProjectItem,
} from '../actions/test-support/index';
import { PreviewPanel } from './index';
import type { PreviewPanelProps } from './types';

const { formatDateMock, getGalleryItemKindLabelMock, translateMock } = vi.hoisted(() => ({
  formatDateMock: vi.fn(() => '31 Mar 2026'),
  getGalleryItemKindLabelMock: vi.fn(() => 'Screenshot'),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  formatDate: formatDateMock,
  getGalleryItemKindLabel: getGalleryItemKindLabelMock,
}));

vi.mock('../../video-review', () => ({
  VideoReview: (props: { aggregateId: string }) => (
    <div data-ui="preview.videoReview">{props.aggregateId}</div>
  ),
}));

vi.mock('./media', () => ({
  PreviewMedia: (props: Pick<PreviewPanelProps, 'item' | 'onClose' | 'previewUrl'>) => (
    <div data-ui="preview.media">
      {props.item.filename}:{props.previewUrl ?? 'no-preview'}
      <button type="button" data-ui="preview.close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('./sidebar-sections', () => ({
  PreviewActions: (props: Pick<PreviewPanelProps, 'trashMode' | 'onRestoreTrash'>) =>
    props.trashMode ? (
      <section data-ui="preview.actions">
        <button
          type="button"
          data-ui="gallery.preview.restore"
          onClick={() => void props.onRestoreTrash?.()}
        >
          Restore
        </button>
      </section>
    ) : (
      <div data-ui="preview.actions" />
    ),
  PreviewMetadataCards: (props: Pick<PreviewPanelProps, 'item'>) => (
    <div data-ui="preview.metadata">{props.item.mimeType}</div>
  ),
  PreviewTagEditor: (props: Pick<PreviewPanelProps, 'tagDraft'>) => (
    <div data-ui="preview.tags">{props.tagDraft}</div>
  ),
  PreviewPromotionAction: () => <div data-ui="preview.promotion" />,
  PreviewProjectUsage: () => <div data-ui="preview.project-usage" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<PreviewPanelProps> = {}): PreviewPanelProps {
  return {
    item: {
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
    },
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
    onSave: vi.fn(async () => undefined),
    onDownload: vi.fn(async () => undefined),
    onCopy: vi.fn(async () => undefined),
    onEdit: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function render(props: PreviewPanelProps) {
  act(() => {
    root?.render(<PreviewPanel {...props} />);
  });
}

it('uses the shared large-surface radius for the preview workspace', () => {
  render(createProps());

  expect(container?.querySelector('[data-ui="gallery.preview.surface"]')?.className).toContain(
    'rounded-[var(--sniptale-radius-lg)]'
  );
});

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

it('renders preview shell, updates the filename, and forwards close actions', () => {
  const props = createProps();

  render(props);

  expect(container?.textContent).not.toContain('gallery.preview.inspector');
  expect(container?.textContent).toContain('Screenshot');
  expect(container?.textContent).toContain('31 Mar 2026');
  expect(container?.querySelector('[data-ui="preview.promotion"]')).toBeNull();

  const input = container?.querySelector('input');
  const closeButton = container?.querySelector('[data-ui="preview.close"]');

  if (!(input instanceof HTMLInputElement) || !(closeButton instanceof HTMLButtonElement)) {
    throw new Error('Expected preview panel controls');
  }

  setInputValue(input, 'renamed.png');
  act(() => {
    closeButton.click();
  });

  expect(props.onFilenameChange).toHaveBeenCalledWith('renamed.png');
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('renders source link when available and fallback copy when missing', () => {
  render(
    createProps({
      item: {
        ...createProps().item,
        sourceUrl: 'https://example.test/source',
      },
    })
  );

  const sourceLink = container?.querySelector('a[href="https://example.test/source"]');
  expect(sourceLink?.textContent).toBe('https://example.test/source');

  render(createProps());

  expect(container?.textContent).toContain('gallery.preview.sourceMissing');
});

it('shows Trash source and filename as inert metadata', () => {
  const props = createProps({
    trashMode: true,
    onRestoreTrash: vi.fn(async () => true),
    item: { ...createProps().item, sourceUrl: 'https://example.test/source' },
  });
  render(props);
  expect(container?.textContent).toContain('https://example.test/source');
  expect(container?.querySelector('a[href]')).toBeNull();
  expect(container?.querySelector('input:not([type="range"])')).toBeNull();
  expect(container?.querySelector('[data-ui="preview.promotion"]')).toBeNull();
  expect(container?.querySelector('[data-ui="preview.actions"]')).not.toBeNull();
});

it('renders unsafe source urls as inert text instead of links', () => {
  render(
    createProps({
      item: {
        ...createProps().item,
        sourceUrl: 'javascript:alert(1)',
      },
    })
  );

  expect(container?.textContent).toContain('javascript:alert(1)');
  expect(container?.querySelector('a[href]')).toBeNull();
});

it('shows the draft deletion date below the creation date in the inspector header', () => {
  const baseProps = createProps();

  render(
    createProps({
      item: {
        ...baseProps.item,
        expiresAt: 99,
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 2 },
      },
    })
  );

  expect(formatDateMock).toHaveBeenCalledWith(1);
  expect(formatDateMock).toHaveBeenCalledWith(99);
  expect(container?.textContent).toContain('gallery.app.draftExpires 31 Mar 2026');
});

it('uses project name as the source fallback for scenario export items and keeps filename read-only', () => {
  render(
    createProps({
      item: createScenarioExportItem({
        filename: 'scenario-export.zip',
        project: {
          availability: 'available' as const,
          id: 'project-1',
          name: 'Quarterly Demo',
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    })
  );

  const input = container?.querySelector('input');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected preview filename input');
  }

  expect(container?.textContent).toContain('Quarterly Demo');
  expect(container?.textContent).toContain('gallery.preview.filename');
  expect(input.readOnly).toBe(true);
});

it('surfaces unavailable project recovery state and keeps its identity read-only', () => {
  render(
    createProps({
      item: createVideoProjectItem({
        filename: 'broken-project',
        unavailableReason: 'invalid',
      }),
    })
  );

  expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.preview.unavailableInvalidProject'
  );
  expect(container?.textContent).toContain('gallery.preview.unavailableProjectRecovery');
  expect(container?.querySelector('input')?.readOnly).toBe(true);
});

it('hides the inspector sidebar when collapsed and closes on Escape', () => {
  const props = createProps({ inspectorCollapsed: true });

  render(props);

  expect(container?.textContent).not.toContain('gallery.preview.inspector');
  expect(container?.querySelector('input')).toBeNull();

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('focuses Trash Restore and returns focus to opener or surviving search on close', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const props = createProps({
    trashMode: true,
    inspectorCollapsed: true,
    onRestoreTrash: vi.fn(async () => true),
  });
  render(props);
  expect(document.activeElement?.getAttribute('data-ui')).toBe('gallery.preview.restore');
  expect(container?.querySelector('aside [data-ui="gallery.preview.restore"]')).not.toBeNull();
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));
  expect(props.onClose).toHaveBeenCalledOnce();
  await act(async () => root?.render(null));
  await Promise.resolve();
  expect(document.activeElement).toBe(opener);

  const search = document.createElement('input');
  search.setAttribute('data-ui', 'test.search');
  const searchLabel = document.createElement('label');
  searchLabel.setAttribute('data-ui', 'gallery.header.search');
  searchLabel.append(search);
  document.body.append(searchLabel);
  opener.focus();
  render(props);
  opener.remove();
  await act(async () =>
    container?.querySelector<HTMLButtonElement>('[data-ui="gallery.preview.restore"]')?.click()
  );
  expect(props.onRestoreTrash).toHaveBeenCalledOnce();
  await act(async () => root?.render(null));
  await Promise.resolve();
  expect(document.activeElement).toBe(search);
  searchLabel.remove();
});

it('keeps keyboard focus within a Trash preview with the inspector open', () => {
  render(
    createProps({
      trashMode: true,
      inspectorCollapsed: true,
      onRestoreTrash: vi.fn(async () => true),
    })
  );
  const restore = container?.querySelector<HTMLButtonElement>(
    '[data-ui="gallery.preview.restore"]'
  );
  const close = container?.querySelector<HTMLButtonElement>('[data-ui="preview.close"]');
  restore?.focus();
  act(() =>
    restore?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(close);
  act(() =>
    close?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    )
  );
  expect(document.activeElement).toBe(restore);
});

it('keeps focus on Restore when navigating between Trash previews in one session', async () => {
  const first = createProps({ trashMode: true, onRestoreTrash: vi.fn(async () => true) });
  act(() => root?.render(<PreviewPanel {...first} />));
  const second = createProps({
    ...first,
    item: { ...first.item, id: 'asset-2', filename: 'next.png' },
  });
  await act(async () => root?.render(<PreviewPanel {...second} />));
  await Promise.resolve();
  expect(document.activeElement).toBe(
    container?.querySelector('[data-ui="gallery.preview.restore"]')
  );
});

it('resets video review mode when the unkeyed preview changes items', () => {
  const video = createMediaItem({
    id: 'video-a',
    filename: 'first.webm',
    kind: 'recording',
    mimeType: 'video/webm',
  });
  render(createProps({ item: video, initialMode: 'edit' }));
  expect(container?.querySelector('[data-ui="preview.videoReview"]')?.textContent).toBe('video-a');

  render(createProps({ item: { ...createProps().item, id: 'image-b' } }));
  expect(container?.querySelector('[data-ui="preview.videoReview"]')).toBeNull();
  expect(container?.querySelector('[data-ui="preview.media"]')).not.toBeNull();

  render(createProps({ item: video }));
  expect(container?.querySelector('[data-ui="preview.videoReview"]')).toBeNull();
});

it('navigates adjacent media with arrow keys but preserves arrow editing inside fields', () => {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const props = createProps({
    navigation: {
      current: 2,
      total: 3,
      hasPrevious: true,
      hasNext: true,
      onPrevious,
      onNext,
    },
  });

  render(props);
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
  });
  expect(onPrevious).toHaveBeenCalledOnce();
  expect(onNext).toHaveBeenCalledOnce();

  const input = container?.querySelector('input');
  act(() => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
  });
  expect(onNext).toHaveBeenCalledOnce();
});

it('keeps close and inspector toggle outside the pending metadata boundary', () => {
  const props = createProps({ item: createMediaItem() });
  render(props);
  const header = container?.querySelector('[data-ui="gallery.preview.inspectorHeader"]');
  const close = header?.querySelector<HTMLButtonElement>(
    'button[aria-label="common.actions.close"]'
  );
  const toggle = header?.querySelector<HTMLButtonElement>(
    'button[aria-label="gallery.preview.hideInspector"]'
  );
  expect(close?.closest('[inert]')).toBeNull();
  expect(toggle?.closest('[inert]')).toBeNull();
  expect(
    container?.querySelector('[data-ui="preview.metadata"]')?.closest('[inert]')
  ).not.toBeNull();
  act(() => {
    close?.click();
    toggle?.click();
  });
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onInspectorToggle).toHaveBeenCalledOnce();
});
