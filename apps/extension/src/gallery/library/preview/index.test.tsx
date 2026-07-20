// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioExportItem, createVideoProjectItem } from '../actions/test-support/index';
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

vi.mock('./views', () => ({
  PreviewActions: () => <div data-ui="preview.actions" />,
  PreviewMedia: (props: Pick<PreviewPanelProps, 'item' | 'onClose' | 'previewUrl'>) => (
    <div data-ui="preview.media">
      {props.item.filename}:{props.previewUrl ?? 'no-preview'}
      <button type="button" data-ui="preview.close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
  PreviewMetadataCards: (props: Pick<PreviewPanelProps, 'item'>) => (
    <div data-ui="preview.metadata">{props.item.mimeType}</div>
  ),
  PreviewTagEditor: (props: Pick<PreviewPanelProps, 'tagDraft'>) => (
    <div data-ui="preview.tags">{props.tagDraft}</div>
  ),
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

  expect(container?.textContent).toContain('gallery.preview.inspector');
  expect(container?.textContent).toContain('Screenshot');
  expect(container?.textContent).toContain('31 Mar 2026');

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

it('uses project name as the source fallback for scenario export items and keeps filename read-only', () => {
  render(
    createProps({
      item: createScenarioExportItem({
        filename: 'scenario-export.zip',
        project: {
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
