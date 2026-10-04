// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioItem, createVideoProjectItem } from '../actions/test-support/index';
import { translate } from '../../../platform/i18n';
import { createGridMetricsFixture } from '../test-support/items';

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: (props: { deferUntilVisible?: boolean; fit?: string; item?: { id: string } }) => (
    <div
      data-deferred={String(props.deferUntilVisible ?? false)}
      data-fit={props.fit ?? 'cover'}
      data-ui="test.thumb"
    >
      {props.item?.id}
    </div>
  ),
  getKindIcon: () => (props: { className?: string }) => <svg data-ui="test.icon" {...props} />,
}));

import { GalleryGridCanvas, GalleryMediaList } from './grid-cards';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const metrics = (
  items: Parameters<typeof createGridMetricsFixture>[0]['items'],
  gridWidth: number,
  viewMode: 'compact-grid' | 'large-grid',
  columnCount: number
) => createGridMetricsFixture({ items, gridWidth, viewMode, columnCount });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

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
        gridMetrics={metrics([item], 400, 'large-grid', 1)}
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

it('renders scenario rows as shared selectable items', () => {
  const scenarioItem = createScenarioItem({
    id: 'scenario:project-1',
    project: {
      availability: 'available' as const,
      id: 'project-1',
      name: 'Scenario',
      createdAt: 1,
      updatedAt: 2,
      tags: ['alpha'],
    },
    tags: ['alpha'],
  });
  const onPreviewOpen = vi.fn();
  const onToggleSelection = vi.fn();
  const otherScenario = createScenarioItem({
    id: 'scenario:project-2',
    project: {
      availability: 'available',
      createdAt: 2,
      id: 'project-2',
      name: 'Other scenario',
      updatedAt: 2,
    },
  });

  act(() => {
    root?.render(
      <GalleryMediaList
        filteredItems={[scenarioItem, otherScenario]}
        onPreviewOpen={onPreviewOpen}
        onToggleSelection={onToggleSelection}
        selectedIds={new Set(['scenario:project-1'])}
      />
    );
  });

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const selectionButton = buttons.find((button) => button.className.includes('h-8 w-8'));
  const detailButton = buttons.find((button) => button.textContent?.includes('Other scenario'));

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
  expect(onPreviewOpen).toHaveBeenCalledWith(otherScenario);
  expect(container?.textContent).toContain('alpha');
});

it.each(['compact-grid', 'large-grid', 'list'] as const)(
  'exposes project names, content and direct editor actions in %s',
  (viewMode) => {
    const video = createVideoProjectItem();
    const scenario = createScenarioItem();
    const items = [video, scenario];
    const onProjectOpen = vi.fn();
    act(() =>
      root?.render(
        viewMode === 'list' ? (
          <GalleryMediaList
            filteredItems={items}
            onPreviewOpen={vi.fn()}
            onProjectOpen={onProjectOpen}
            onToggleSelection={vi.fn()}
            selectedIds={new Set()}
          />
        ) : (
          <GalleryGridCanvas
            filteredItems={items}
            visibleItems={items}
            gridMetrics={metrics(items, 800, viewMode, 2)}
            gridWidth={800}
            onPreviewOpen={vi.fn()}
            onProjectOpen={onProjectOpen}
            onToggleSelection={vi.fn()}
            selectedIds={new Set()}
            viewMode={viewMode}
          />
        )
      )
    );
    const actions = [...container!.querySelectorAll('button')].filter((button) =>
      viewMode === 'list'
        ? button.textContent === translate('gallery.preview.openInEditor')
        : button.getAttribute('aria-label') === translate('gallery.preview.openInEditor')
    );
    expect(actions).toHaveLength(2);
    if (viewMode === 'list') {
      const header = container!.querySelector<HTMLElement>('[data-ui="gallery.list.header"]');
      const rows = container!.querySelectorAll<HTMLElement>('[data-ui="gallery.list.row"]');
      expect(header?.style.gridTemplateColumns).toBe(rows[0]?.style.gridTemplateColumns);
      expect(rows[0]?.querySelectorAll(':scope > [role="cell"]')).toHaveLength(8);
      expect(
        rows[0]?.querySelector('[data-ui="gallery.list.source"]')?.nextElementSibling
      ).not.toBeNull();
      expect(actions[0]?.closest('[role="cell"]')).not.toBeNull();
      expect(actions[0]?.className).toContain('max-w-[180px]');
      expect(
        [...container!.querySelectorAll('[data-ui="test.thumb"]')].map((thumb) =>
          thumb.getAttribute('data-deferred')
        )
      ).toEqual(['true', 'true']);
    } else {
      expect(actions[0]?.className).toContain('w-8');
      expect(actions[0]?.getAttribute('title')).toBe(translate('gallery.preview.openInEditor'));
      expect(actions[0]?.textContent).toBe('');
      expect(
        [...container!.querySelectorAll('[data-ui="test.thumb"]')].map((thumb) =>
          thumb.getAttribute('data-deferred')
        )
      ).toEqual(['false', 'false']);
      expect(
        actions[0]?.closest('article')?.querySelector('[data-ui="gallery.grid.thumbnail-viewport"]')
      ).not.toBeNull();
    }
    act(() => actions.forEach((button) => button.click()));
    expect(onProjectOpen.mock.calls).toEqual([[video], [scenario]]);
    expect(container!.textContent).toContain(video.filename);
    expect(container!.textContent).toContain(scenario.filename);
    expect(container!.textContent).toContain(translate('gallery.preview.clips'));
  }
);

it.each(['compact-grid', 'large-grid'] as const)(
  'keeps long project names and unavailable editor actions usable in %s',
  (viewMode) => {
    const filename = 'A very long project name that must not overlap its editor action.sniptale';
    const item = { ...createVideoProjectItem(), filename, unavailableReason: 'invalid' as const };
    const onPreviewOpen = vi.fn();
    const onProjectOpen = vi.fn();
    act(() =>
      root?.render(
        <GalleryGridCanvas
          filteredItems={[item]}
          visibleItems={[item]}
          gridMetrics={metrics([item], 220, viewMode, 1)}
          gridWidth={220}
          onPreviewOpen={onPreviewOpen}
          onProjectOpen={onProjectOpen}
          onToggleSelection={vi.fn()}
          selectedIds={new Set()}
          viewMode={viewMode}
        />
      )
    );
    const name = [
      ...(container?.querySelectorAll<HTMLButtonElement>(`button[title="${filename}"]`) ?? []),
    ].at(-1);
    const editor = container?.querySelector<HTMLButtonElement>(
      `button[aria-label="${translate('gallery.preview.openInEditor')}"]`
    );
    expect(name?.className).toContain('truncate');
    expect(name?.parentElement?.className).toContain('min-w-0');
    expect(editor?.className).toContain('shrink-0');
    expect(editor?.disabled).toBe(true);
    expect(editor?.title).toBe(translate('gallery.preview.projectUnavailable'));
    expect(container?.textContent).toContain(translate('gallery.preview.projectUnavailable'));
    act(() => {
      name?.click();
      editor?.click();
    });
    expect(onPreviewOpen).toHaveBeenCalledWith(item);
    expect(onProjectOpen).not.toHaveBeenCalled();
  }
);
