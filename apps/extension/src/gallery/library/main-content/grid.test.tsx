// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem, createScenarioItem } from '../actions/test-support/index';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    translate: translateMock,
  };
});

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: (props: { assetId: string }) => <div data-ui="test.thumb">{props.assetId}</div>,
  formatDate: (timestamp: number) => `date:${timestamp}`,
  getKindIcon: () => (props: { className?: string }) => <svg data-ui="test.icon" {...props} />,
}));

import { GalleryGrid } from './grid';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<Parameters<typeof GalleryGrid>[0]> = {}) {
  return {
    filteredItems: [],
    folderFilter: 'all' as const,
    gridMetrics: { columnCount: 2, rowTops: [0], startRow: 0, totalRows: 0 },
    gridWidth: 900,
    gridViewportRef: { current: null },
    isLoading: false,
    libraryEmpty: false,
    search: '',
    onPreviewOpen: vi.fn(),
    onToggleSelection: vi.fn(),
    onSelectRange: vi.fn(() => new Set<string>()),
    keyboardEnabled: true,
    previewOpen: false,
    navigationContext: 'test',
    selectedIds: new Set<string>(),
    viewMode: 'compact-grid' as const,
    visibleItems: [],
    ...overrides,
  };
}

function renderGrid(props: Parameters<typeof GalleryGrid>[0]) {
  act(() => {
    root?.render(<GalleryGrid {...props} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('distinguishes a Trash search miss from an empty Trash', () => {
  renderGrid(createProps({ trashMode: true }));
  expect(container?.textContent).toContain('gallery.app.trashEmpty');
  renderGrid(createProps({ trashMode: true, search: 'missing' }));
  expect(container?.textContent).toContain('gallery.app.trashNoResults');
  expect(container?.textContent).not.toContain('gallery.app.trashEmpty');
  renderGrid(createProps({ trashMode: true, search: 'missing', trashItemCount: 0 }));
  expect(container?.textContent).toContain('gallery.app.trashEmpty');
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

it('renders loading and empty states for gallery content', () => {
  renderGrid(createProps({ isLoading: true }));
  expect(container?.textContent).toContain('gallery.app.loading');
  expect(container?.querySelector('[data-ui="gallery.content.surface"]')?.className).toContain(
    'rounded-[var(--sniptale-radius-lg)]'
  );

  renderGrid(createProps());
  expect(container?.textContent).toContain('gallery.app.emptyTitle');
  expect(container?.textContent).toContain('gallery.app.emptyDescription');
});

it('renders visible items and wires preview and selection actions', () => {
  const firstItem = createMediaItem({ id: 'asset-1', filename: 'capture.png', tags: ['alpha'] });
  const secondItem = createMediaItem({
    id: 'asset-2',
    filename: 'video.webm',
    kind: 'recording',
    mimeType: 'video/webm',
    source: { kind: 'recording', recordingId: 'rec-1' },
  });
  const props = createProps({
    filteredItems: [firstItem, secondItem],
    selectedIds: new Set(['asset-2']),
    visibleItems: [firstItem, secondItem],
  });

  renderGrid(props);

  const surface = container?.querySelector('[data-ui="gallery.content.surface"]');
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const selectionButton = buttons.find((button) => button.className.includes('h-8 w-8'));
  const previewButton = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="capture.png"]'
  );

  if (!selectionButton || !previewButton) {
    throw new Error('Expected gallery grid item buttons');
  }

  act(() => {
    selectionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    previewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(props.gridViewportRef.current).toBeInstanceOf(HTMLDivElement);
  expect(surface?.className).toContain('p-4');
  expect(props.onToggleSelection).toHaveBeenCalledWith('asset-1', {
    shiftKey: false,
    orderedIds: ['asset-1', 'asset-2'],
  });
  expect(props.onPreviewOpen).toHaveBeenCalledWith(firstItem);
  expect(container?.textContent).toContain('alpha');
  expect(container?.textContent).toContain('date:1');
});

it('renders scenario items inside the shared grid flow', () => {
  const scenarioItem = createScenarioItem({
    createdAt: 1,
    id: 'scenario:project-1',
    project: {
      availability: 'available' as const,
      id: 'project-1',
      name: 'Scenario',
      createdAt: 1,
      updatedAt: 2,
      tags: ['flow'],
    },
    tags: ['flow'],
    updatedAt: 2,
  });
  const props = createProps({
    filteredItems: [scenarioItem],
    folderFilter: 'scenario',
    selectedIds: new Set(['scenario:project-1']),
    viewMode: 'list',
    visibleItems: [scenarioItem],
  });

  renderGrid(props);

  const surface = container?.querySelector('[data-ui="gallery.content.surface"]');
  const button = Array.from(container?.querySelectorAll('button') ?? []).find((element) =>
    element.textContent?.includes('Scenario')
  );

  if (!button) {
    throw new Error('Expected scenario preview button');
  }

  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(props.onPreviewOpen).toHaveBeenCalledWith(scenarioItem);
  expect(surface?.className).toContain('p-0');
  expect(surface?.className).not.toContain('p-4');
  expect(container?.textContent).toContain('flow');
  expect(container?.textContent).toContain('date:1');
});

it('keeps a Tab entry when the active card is outside the virtualized window', () => {
  const items = ['first', 'last'].map((id) => createMediaItem({ id, filename: id }));
  const props = createProps({
    filteredItems: items,
    visibleItems: [items[1]!],
    gridMetrics: { columnCount: 1, rowTops: [0, 100, 200], startRow: 1, totalRows: 2 },
  });
  renderGrid(props);
  const surface = container?.querySelector<HTMLElement>('[data-ui="gallery.content.surface"]');
  expect(surface?.tabIndex).toBe(0);
  act(() => surface?.focus());
  renderGrid({ ...props, visibleItems: items, gridMetrics: { ...props.gridMetrics, startRow: 0 } });
  expect(container?.querySelector('[data-gallery-keyboard-id="first"]')).toBe(
    document.activeElement
  );
  expect(surface?.tabIndex).toBe(-1);
});
