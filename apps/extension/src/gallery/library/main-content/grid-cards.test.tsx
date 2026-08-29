// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../actions/test-support/index';
import { translate } from '../../../platform/i18n';
import { GRID_GAP } from '../constants';

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatCompactBytes: (size: number) => `compact-size:${size}`,
  formatBytes: (size: number) => `size:${size}`,
}));

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: (props: { assetId?: string; fit?: string; item?: { id: string } }) => (
    <div data-fit={props.fit ?? 'cover'} data-ui="test.thumb">
      {props.item?.id ?? props.assetId}
    </div>
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

it('keeps the vertical grid gap equal to the horizontal tile gap', () => {
  const items = Array.from({ length: 4 }, (_, index) =>
    createMediaItem({ id: `asset-${index + 1}` })
  );

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={items}
        gridMetrics={{ columnCount: 2, startRow: 0, totalRows: 2 }}
        gridWidth={800}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="compact-grid"
        visibleItems={items}
      />
    );
  });

  const cards = container?.querySelectorAll<HTMLElement>('article');
  const firstHeight = Number.parseFloat(cards?.[0]?.style.height ?? '');
  const secondRowTop = Number.parseFloat(cards?.[2]?.style.top ?? '');

  expect(firstHeight).toBeLessThan(300);
  expect(secondRowTop - firstHeight).toBe(GRID_GAP);
});

it('keeps large-grid cards compact with the canonical row gap', () => {
  const items = Array.from({ length: 2 }, (_, index) =>
    createMediaItem({ id: `large-asset-${index + 1}` })
  );

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={items}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 2 }}
        gridWidth={400}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="large-grid"
        visibleItems={items}
      />
    );
  });

  const cards = container?.querySelectorAll<HTMLElement>('article');
  const firstHeight = Number.parseFloat(cards?.[0]?.style.height ?? '');
  const secondRowTop = Number.parseFloat(cards?.[1]?.style.top ?? '');
  const details = cards?.[0]?.querySelector<HTMLElement>('[data-ui="gallery.large.details"]');
  const metadata = cards?.[0]?.querySelector<HTMLElement>('[data-ui="gallery.large.metadata"]');

  expect(firstHeight).toBeLessThan(360);
  expect(secondRowTop - firstHeight).toBe(GRID_GAP);
  expect(cards?.[0]?.className).toContain('flex flex-col');
  expect(details?.className).toContain('h-[72px]');
  expect(details?.className).toContain('grid-rows-[20px_16px]');
  expect(details?.className).not.toContain('minmax(0,1fr)');
  expect(details?.className).toContain('shrink-0');
  expect(metadata?.className).not.toContain('mt-auto');
  expect(
    cards?.[0]?.querySelector<HTMLElement>('[data-ui="gallery.grid.thumbnail-viewport"]')?.className
  ).toContain('flex-1');
  expect(cards?.[0]?.querySelector('[data-ui="test.thumb"]')?.getAttribute('data-fit')).toBe(
    'contain'
  );
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
  const segments = Array.from(label?.querySelectorAll('span') ?? []);
  const previewButton = label?.closest('button');

  expect(label?.textContent).toBe(filename);
  expect(label?.getAttribute('aria-hidden')).toBe('true');
  expect(segments.map((segment) => segment.textContent)).toEqual([
    'shared-capture-prefix-that-keeps-growing',
    '-unique-tail.png',
    '-unique-tail',
    '.png',
  ]);
  expect(label?.className).toContain('overflow-hidden');
  expect(segments[0]?.className).toContain('shrink');
  expect(segments[1]?.className).toContain('max-w-[55%]');
  expect(segments[2]?.className).toContain('truncate');
  expect(segments[3]?.className).toContain('shrink-0');
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
  expect(container?.textContent).not.toContain('Запись из нескольких источников');
  const groupMetadata = container?.querySelector('[data-ui="gallery.compact.group-metadata"]');
  expect(groupMetadata?.textContent).toContain('date:1');
  expect(groupMetadata?.textContent).toContain('compact-size:512');

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

it('renders one unduplicated recording-group title in large grid', () => {
  const items = ['display', 'webcam'].map((role, order) =>
    createMediaItem({
      id: `recording:${role}`,
      kind: 'recording',
      recordingGroupView: {
        groupId: 'capture-1',
        memberCount: 2,
        order,
        projectId: null,
        projectName: null,
        role: role === 'webcam' ? 'webcam' : 'display',
        sourceLabel: role,
      },
    })
  );

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={items}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
        gridWidth={400}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="large-grid"
        visibleItems={[items[0]!]}
      />
    );
  });

  expect(container?.textContent?.match(/Запись из нескольких источников/g)).toHaveLength(1);
  expect(container?.textContent).not.toContain(translate('gallery.preview.recordingGroup'));
  expect(
    container?.querySelector<HTMLElement>('[data-ui="gallery.large.group-details"]')?.className
  ).toContain('h-[94px]');
  expect(
    container?.querySelector<HTMLElement>('[data-ui="gallery.large.group-metadata"]')?.className
  ).not.toContain('mt-auto');
  expect(container?.querySelector('[data-ui="test.thumb"]')?.getAttribute('data-fit')).toBe(
    'contain'
  );
});

it.each(['compact-grid', 'large-grid'] as const)(
  'shows the deletion date for draft recording groups in %s',
  (viewMode) => {
    const items = ['display', 'webcam'].map((role, order) => ({
      ...createMediaItem({
        createdAt: 1,
        id: `recording:${role}`,
        kind: 'recording',
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 22 },
        recordingGroupView: {
          groupId: 'capture-1',
          memberCount: 2,
          order,
          projectId: null,
          projectName: null,
          role: role === 'webcam' ? ('webcam' as const) : ('display' as const),
          sourceLabel: role,
        },
      }),
      expiresAt: 99,
    }));

    act(() => {
      root?.render(
        <GalleryGridCanvas
          filteredItems={items}
          gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
          gridWidth={400}
          onPreviewOpen={vi.fn()}
          onToggleSelection={vi.fn()}
          selectedIds={new Set()}
          viewMode={viewMode}
          visibleItems={[items[0]!]}
        />
      );
    });

    const metadata = container?.querySelector<HTMLElement>(
      `[data-ui="gallery.${viewMode === 'compact-grid' ? 'compact' : 'large'}.group-metadata"]`
    );
    expect(metadata?.textContent).toContain('date:99');
    expect(metadata?.textContent).not.toContain('date:1');
    expect(metadata?.querySelector('[title]')?.getAttribute('title')).toBe(
      `${translate('gallery.app.draftExpires')} date:99`
    );
  }
);

it('does not present a stale video-project thumbnail as actively updating', () => {
  const item = {
    ...createVideoProjectItem(),
    presentationRevision: 1,
    workspaceRevision: 2,
  };

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={[item]}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
        gridWidth={400}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="large-grid"
        visibleItems={[item]}
      />
    );
  });

  expect(container?.textContent).not.toContain(translate('gallery.app.updatingPreview'));
});

it('dims a stale media thumbnail and centers the preview update status on its frame', () => {
  const item = createMediaItem({
    id: 'stale-image',
    filename: 'stale.png',
    presentationRevision: 1,
    workspaceRevision: 2,
  });

  act(() => {
    root?.render(
      <GalleryGridCanvas
        filteredItems={[item]}
        gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
        gridWidth={400}
        onPreviewOpen={vi.fn()}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="large-grid"
        visibleItems={[item]}
      />
    );
  });

  const overlay = container?.querySelector<HTMLElement>(
    '[data-ui="gallery.grid.preview-updating"]'
  );
  expect(overlay?.textContent).toContain(translate('gallery.app.updatingPreview'));
  expect(overlay?.className).toContain('absolute inset-0');
  expect(overlay?.parentElement?.dataset['ui']).toBe('gallery.grid.thumbnail-viewport');
  expect(container?.querySelector('[data-ui="gallery.large.details"]')?.textContent).not.toContain(
    translate('gallery.app.updatingPreview')
  );
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
    sourceTitle: 'Example page',
    sourceUrl: 'https://www.example.com/articles/capture',
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
  expect(container?.textContent).toContain(translate('gallery.app.listColumnSource'));
  expect(container?.textContent).toContain(translate('gallery.app.listColumnName'));
  expect(container?.querySelector('[data-ui="gallery.list.source"]')?.textContent).toContain(
    'Example page'
  );
  expect(container?.querySelector('[data-ui="gallery.list.source"]')?.textContent).toContain(
    'example.com'
  );
  const listHeader = container?.querySelector<HTMLElement>('[data-ui="gallery.list.header"]');
  const listRow = container?.querySelector<HTMLElement>('[data-ui="gallery.list.row"]');
  expect(listHeader?.style.gridTemplateColumns).toBe(listRow?.style.gridTemplateColumns);
  expect(listHeader?.children).toHaveLength(8);
  expect(listRow?.children).toHaveLength(8);
  expect(listHeader?.style.gridTemplateColumns).toContain('minmax(220px, 2fr)');
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
  expect(columnHeaders.map((header) => header.textContent)).toEqual([
    translate('gallery.app.listColumnSelection'),
    translate('gallery.app.listColumnType'),
    translate('gallery.app.listColumnPreview'),
    translate('gallery.app.listColumnSource'),
    translate('gallery.app.listColumnCreated'),
    translate('gallery.app.listColumnName'),
    translate('gallery.app.listColumnTags'),
    translate('gallery.app.listColumnSize'),
  ]);

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

  expect(container?.textContent).not.toContain('date:1');
  expect(container?.textContent).toContain('date:99');
  expect(container?.textContent).not.toContain(translate('gallery.app.draftExpires'));
  expect(container?.textContent).not.toContain('date:22');
  const compactMetadata = container?.querySelector('[data-ui="gallery.compact.metadata"]');
  expect(compactMetadata?.className).toContain('whitespace-nowrap');
  expect(compactMetadata?.textContent).toContain('date:99');
  expect(compactMetadata?.querySelector('[title]')?.getAttribute('title')).toBe(
    `${translate('gallery.app.draftExpires')} date:99`
  );
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
