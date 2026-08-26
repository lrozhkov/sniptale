// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem, createScenarioItem } from '../actions/test-support/index';
import { translate } from '../../../platform/i18n';

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatCompactBytes: (size: number) => `compact-size:${size}`,
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
        filteredItems={[firstItem, secondItem]}
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
  expect(onPreviewOpen).toHaveBeenCalledWith(firstItem);
  expectCompactGridPointerCursors(previewButton, selectionButtons[0]);
  expect(previewButton.closest('article')?.className).toContain(
    'rounded-[var(--sniptale-radius-lg)]'
  );
  expect(previewButton.closest('article')?.textContent).not.toContain('capture.png');
  expect(previewButton.getAttribute('title')).toBe('capture.png');
  const compactMetadata = previewButton
    .closest('article')
    ?.querySelector<HTMLElement>('[data-ui="gallery.compact.metadata"]');
  expect(compactMetadata?.className).toContain('whitespace-nowrap');
  expect(compactMetadata?.textContent).toContain('date:1');
  expect(compactMetadata?.textContent).toContain('compact-size:512');
  expect(container?.textContent).toContain('alpha');
  expect(container?.textContent).not.toContain('plain.pngalpha');
});

it('keeps the distinguishing filename tail and extension visible in constrained layouts', () => {
  const filename = 'shared-capture-prefix-that-keeps-growing-unique-tail.png';
  const item = createMediaItem({ filename, id: 'asset-long-name' });

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={[item]}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
        gridWidth={240}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="large-grid"
        visibleItems={[item]}
      />
    );
  });

  const label = container?.querySelector<HTMLElement>('[data-ui="gallery.filename"]');
  const segments = Array.from(label?.children ?? []);
  const previewButton = label?.closest('button');

  expect(label?.textContent).toBe(filename);
  expect(label?.getAttribute('aria-hidden')).toBe('true');
  expect(segments.map((segment) => segment.textContent)).toEqual([
    'shared-capture-prefix-that-keeps-growing',
    '-unique-tail',
    '.png',
  ]);
  expect(segments[0]?.className).toContain('truncate');
  expect(segments[1]?.className).toContain('shrink-0');
  expect(segments[2]?.className).toContain('shrink-0');
  expect(previewButton?.getAttribute('title')).toBe(filename);
  expect(previewButton?.getAttribute('aria-label')).toBe(filename);
});

it('renders one composite grid card for raw recording tracks without a project', () => {
  const display = createMediaItem({
    id: 'recording:display',
    filename: 'window.webm',
    kind: 'recording',
    recordingGroupView: {
      groupId: 'capture-1',
      memberCount: 2,
      order: 0,
      projectId: null,
      projectName: null,
      role: 'display',
      sourceLabel: 'Design review',
    },
  });
  const webcam = createMediaItem({
    id: 'recording:webcam',
    filename: 'webcam.webm',
    kind: 'recording',
    recordingGroupView: {
      groupId: 'capture-1',
      memberCount: 2,
      order: 1,
      projectId: null,
      projectName: null,
      role: 'webcam',
      sourceLabel: 'HD Camera',
    },
  });
  const onPreviewOpen = vi.fn();
  const onRecordingGroupOpen = vi.fn();
  const onToggleSelection = vi.fn();

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={[display, webcam]}
        gridMetrics={{ columnCount: 2, startRow: 0, totalRows: 1 }}
        gridWidth={800}
        onPreviewOpen={onPreviewOpen}
        onRecordingGroupOpen={onRecordingGroupOpen}
        onToggleSelection={onToggleSelection}
        selectedIds={new Set()}
        viewMode="compact-grid"
        visibleItems={[display]}
      />
    );
  });

  const recordingGroupCard = container?.querySelector('[data-ui="gallery.recording-group.card"]');
  expect(recordingGroupCard).not.toBeNull();
  expect(recordingGroupCard?.className).toContain('rounded-[var(--sniptale-radius-lg)]');
  expect(container?.querySelectorAll('[data-ui="test.thumb"]')).toHaveLength(2);
  expect(container?.textContent).toContain('Экран или окно');
  expect(container?.textContent).toContain('Design review');
  expect(container?.textContent).toContain('Веб-камера');
  expect(container?.textContent).toContain('HD Camera');
  expect(container?.textContent).toContain('Запись из нескольких источников');

  const webcamButton = container?.querySelector<HTMLButtonElement>(
    'button[aria-label^="Веб-камера:"]'
  );
  const editorButton = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('Открыть в редакторе')
  );
  expect(editorButton).toBeUndefined();
  const selectButton = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Выбрать всю запись"]'
  );

  act(() => {
    webcamButton?.click();
    selectButton?.click();
  });

  expect(onPreviewOpen).toHaveBeenCalledWith(webcam);
  expect(onRecordingGroupOpen).not.toHaveBeenCalled();
  expect(onToggleSelection).toHaveBeenCalledWith('recording:display');
  expect(onToggleSelection).toHaveBeenCalledWith('recording:webcam');
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
  expect(container?.textContent).toContain(translate('gallery.app.listColumnType'));
  expect(container?.textContent).toContain(translate('gallery.app.listColumnName'));
  const listHeader = container?.querySelector<HTMLElement>('[data-ui="gallery.list.header"]');
  const listRow = container?.querySelector<HTMLElement>('[data-ui="gallery.list.row"]');
  expect(listHeader?.style.gridTemplateColumns).toBe(listRow?.style.gridTemplateColumns);
  expect(listHeader?.children).toHaveLength(7);
  expect(listRow?.children).toHaveLength(7);
  expect(listHeader?.style.gridTemplateColumns).toContain('minmax(240px, 2.2fr)');
  expect(listHeader?.className).toContain('z-10');
  const columnHeaders = Array.from(
    container?.querySelectorAll<HTMLElement>('[role="columnheader"]') ?? []
  );
  const selectionHeader = columnHeaders[0];
  const previewHeader = columnHeaders.find(
    (header) => header.textContent === translate('gallery.app.listColumnPreview')
  );
  expect(selectionHeader?.className).not.toContain('sr-only');
  expect(selectionHeader?.querySelector('.sr-only')?.textContent).toBe(
    translate('gallery.app.listColumnSelection')
  );
  expect(previewHeader?.hasAttribute('title')).toBe(false);
  expect(columnHeaders.every((header) => header.className.includes('min-w-0'))).toBe(true);

  const kindIcon = container?.querySelector('[data-ui="test.icon"]');
  const thumbnail = container?.querySelector('[data-ui="test.thumb"]');
  expect(kindIcon?.closest('[role="cell"]')).not.toBe(thumbnail?.closest('[role="cell"]'));
});

it('keeps the Created table column limited to the creation date', () => {
  const draft = {
    ...createMediaItem({
      id: 'draft-1',
      createdAt: 1,
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 22 },
      presentationRevision: 1,
      workspaceRevision: 2,
    }),
    expiresAt: 99,
  };

  act(() => {
    root?.render(
      <GalleryMediaList
        filteredItems={[draft]}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
      />
    );
  });

  expect(container?.textContent).toContain('date:1');
  expect(container?.textContent).not.toContain('date:22');
  expect(container?.textContent).not.toContain('date:99');
  expect(container?.textContent).not.toContain(translate('gallery.app.draftExpires'));
  expect(container?.textContent).not.toContain(translate('gallery.app.updatingPreview'));
});

it('shows only the deletion date for drafts in grid cards', () => {
  const draft = {
    ...createMediaItem({
      id: 'draft-1',
      createdAt: 1,
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 22 },
    }),
    expiresAt: 99,
  };

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={[draft]}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
        gridWidth={400}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="compact-grid"
        visibleItems={[draft]}
      />
    );
  });

  expect(container?.textContent).toContain('date:1');
  expect(container?.textContent).toContain(`${translate('gallery.app.draftExpires')} date:99`);
  expect(container?.textContent).not.toContain('date:22');
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

it('shows grouped recording role and member count outside the thumbnail', () => {
  const item = createMediaItem({
    filename: 'webcam.webm',
    kind: 'recording',
    recordingGroupView: {
      groupId: 'capture-1',
      memberCount: 2,
      order: 1,
      projectId: 'project-1',
      role: 'webcam',
      sourceLabel: null,
    },
  });
  const onRecordingGroupOpen = vi.fn();

  act(() => {
    root?.render(
      <GalleryMediaList
        filteredItems={[item]}
        onPreviewOpen={vi.fn()}
        onRecordingGroupOpen={onRecordingGroupOpen}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
      />
    );
  });

  const thumbnailCell = container
    ?.querySelector('[data-ui="test.thumb"]')
    ?.closest('[role="cell"]');
  expect(container?.textContent).toContain('Веб-камера');
  expect(container?.textContent).toContain('Дорожек в группе: 2');
  expect(container?.textContent).toContain('Запись из нескольких источников');
  expect(container?.querySelector('[role="rowgroup"]')).not.toBeNull();
  expect(thumbnailCell?.textContent).not.toContain('Веб-камера');
  const openButton = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('Открыть в редакторе')
  );
  act(() => openButton?.click());
  expect(onRecordingGroupOpen).toHaveBeenCalledWith(item);
});
