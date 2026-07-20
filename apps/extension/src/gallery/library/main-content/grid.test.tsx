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
    gridMetrics: { columnCount: 2, startRow: 0, totalRows: 1 },
    gridWidth: 900,
    gridViewportRef: { current: null },
    isLoading: false,
    onPreviewOpen: vi.fn(),
    onToggleSelection: vi.fn(),
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

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const selectionButton = buttons.find((button) => button.className.includes('h-8 w-8'));
  const previewButton = buttons.find((button) => button.textContent?.includes('capture.png'));

  if (!selectionButton || !previewButton) {
    throw new Error('Expected gallery grid item buttons');
  }

  act(() => {
    selectionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    previewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(props.gridViewportRef.current).toBeInstanceOf(HTMLDivElement);
  expect(props.onToggleSelection).toHaveBeenCalledWith('asset-1', { shiftKey: false });
  expect(props.onPreviewOpen).toHaveBeenCalledWith(firstItem);
  expect(container?.textContent).toContain('alpha');
  expect(container?.textContent).toContain('date:1');
});

it('renders scenario items inside the shared grid flow', () => {
  const scenarioItem = createScenarioItem({
    createdAt: 1,
    id: 'scenario:project-1',
    project: { id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2, tags: ['flow'] },
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
  expect(container?.textContent).toContain('flow');
  expect(container?.textContent).toContain('date:1');
});
