// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem, createScenarioItem } from '../actions/test-support/index';

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatBytes: (size: number) => `size:${size}`,
}));

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: (props: { assetId?: string; item?: { id: string } }) => (
    <div data-ui="test.thumb">{props.item?.id ?? props.assetId}</div>
  ),
  formatDate: (timestamp: number) => `date:${timestamp}`,
  getKindIcon: () => (props: { className?: string }) => <svg data-ui="test.icon" {...props} />,
}));

import { GalleryGridCanvas, GalleryMediaList } from './grid-cards';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

it('renders compact grid cards with thumbnail preview actions and optional tags', () => {
  const firstItem = createMediaItem({
    id: 'asset-1',
    filename: 'capture.png',
    size: 512,
    tags: ['alpha'],
  });
  const secondItem = createMediaItem({
    id: 'asset-2',
    filename: 'plain.png',
    size: 256,
    tags: [],
  });
  const onPreviewOpen = vi.fn();
  const onToggleSelection = vi.fn();

  act(() => {
    root?.render(
      <GalleryGridCanvas
        gridMetrics={{ columnCount: 2, startRow: 0, totalRows: 1 }}
        gridWidth={800}
        onPreviewOpen={onPreviewOpen}
        onToggleSelection={onToggleSelection}
        selectedIds={new Set(['asset-2'])}
        viewMode="compact-grid"
        visibleItems={[firstItem, secondItem]}
      />
    );
  });

  const previewButton = container?.querySelector('button[aria-label="capture.png"]');
  const selectionButtons = Array.from(container?.querySelectorAll('button') ?? []).filter(
    (button) => button.className.includes('h-8 w-8')
  );

  if (!(previewButton instanceof HTMLButtonElement) || selectionButtons.length < 2) {
    throw new Error('Expected compact grid controls');
  }

  act(() => {
    selectionButtons[0]?.click();
    previewButton.click();
  });

  expect(onToggleSelection).toHaveBeenCalledWith('asset-1', { shiftKey: false });
  expect(onPreviewOpen).toHaveBeenCalledWith(firstItem, { inspectorCollapsed: true });
  expectCompactGridPointerCursors(previewButton, selectionButtons[0]);
  expect(container?.textContent).toContain('alpha');
  expect(container?.textContent).not.toContain('plain.pngalpha');
});

function expectCompactGridPointerCursors(
  previewButton: HTMLButtonElement,
  selectionButton: HTMLButtonElement | undefined
) {
  expect(previewButton.className).toContain('cursor-pointer');
  expect(selectionButton?.className).toContain('cursor-pointer');
}

it('renders list rows with fallback tags and detail-preview actions', () => {
  const firstItem = createMediaItem({
    id: 'asset-1',
    filename: 'capture.png',
    size: 512,
    tags: [],
  });
  const onPreviewOpen = vi.fn();
  const onToggleSelection = vi.fn();

  act(() => {
    root?.render(
      <GalleryMediaList
        filteredItems={[firstItem]}
        onPreviewOpen={onPreviewOpen}
        onToggleSelection={onToggleSelection}
        selectedIds={new Set(['asset-1'])}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const selectionButton = buttons.find((button) => button.className.includes('h-8 w-8'));
  const detailButton = buttons.find(
    (button) =>
      button.getAttribute('aria-label') === 'capture.png' &&
      button.textContent?.includes('capture.png')
  );

  if (
    !(selectionButton instanceof HTMLButtonElement) ||
    !(detailButton instanceof HTMLButtonElement)
  ) {
    throw new Error('Expected list row controls');
  }

  act(() => {
    selectionButton.click();
    detailButton.click();
  });

  expect(onToggleSelection).toHaveBeenCalledWith('asset-1', { shiftKey: false });
  expect(onPreviewOpen).toHaveBeenCalledWith(firstItem);
  expect(container?.textContent).toContain('—');
  expect(container?.textContent).toContain('size:512');
  expect(container?.textContent).toContain('date:1');
});

it('renders scenario rows as shared selectable items', () => {
  const scenarioItem = createScenarioItem({
    id: 'scenario:project-1',
    project: { id: 'project-1', name: 'Scenario', createdAt: 1, updatedAt: 2, tags: ['alpha'] },
    tags: ['alpha'],
  });
  const onPreviewOpen = vi.fn();
  const onToggleSelection = vi.fn();

  act(() => {
    root?.render(
      <GalleryMediaList
        filteredItems={[scenarioItem]}
        onPreviewOpen={onPreviewOpen}
        onToggleSelection={onToggleSelection}
        selectedIds={new Set(['scenario:project-1'])}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const selectionButton = buttons.find((button) => button.className.includes('h-8 w-8'));
  const detailButton = buttons.find((button) => button.textContent?.includes('Scenario'));

  if (
    !(selectionButton instanceof HTMLButtonElement) ||
    !(detailButton instanceof HTMLButtonElement)
  ) {
    throw new Error('Expected shared scenario row controls');
  }

  act(() => {
    selectionButton.click();
    detailButton.click();
  });

  expect(onToggleSelection).toHaveBeenCalledWith('scenario:project-1', { shiftKey: false });
  expect(onPreviewOpen).toHaveBeenCalledWith(scenarioItem);
  expect(container?.textContent).toContain('alpha');
});
