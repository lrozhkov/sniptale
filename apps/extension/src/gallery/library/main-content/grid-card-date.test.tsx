// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support';
import { translate } from '../../../platform/i18n';
import { GalleryGridCardDate } from './grid-card-date';

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: () => <div data-ui="test.thumb" />,
  formatDate: (timestamp: number) => `date:${timestamp}`,
}));

import { GalleryGridCanvas } from './grid-cards';
import { createGridMetricsFixture } from '../test-support/items';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

it('labels a non-expiring draft creation date and leaves a saved card without a Trash icon', () => {
  const draft = createMediaItem({
    createdAt: 12,
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 12 },
  });
  act(() => root?.render(<GalleryGridCardDate items={[draft]} compact />));
  const date = container?.querySelector('span[title]');
  expect(date?.textContent).toBe('date:12');
  expect(date?.getAttribute('title')).toContain('date:12');
  expect(date?.getAttribute('title')).toContain(translate('gallery.app.draftNoExpiration'));
  expect(date?.querySelector('svg')?.classList.toString()).toContain('lucide-trash');

  const saved = createMediaItem({
    createdAt: 13,
    lifecycle: { savedAt: 13, storageClass: 'library', updatedAt: 13 },
  });
  act(() => root?.render(<GalleryGridCardDate items={[saved]} compact />));
  expect(container?.textContent).toContain('date:13');
  expect(container?.querySelector('svg')).toBeNull();
});

it.each(['compact-grid', 'large-grid'] as const)(
  'shows the Trash date and aligned icon on deleted material cards in %s',
  (viewMode) => {
    const item = createMediaItem({
      createdAt: 1,
      lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 2, trashedAt: 3 },
    });

    act(() => {
      root?.render(
        <GalleryGridCanvas
          filteredItems={[item]}
          gridMetrics={createGridMetricsFixture({
            items: [item],
            columnCount: 1,
            gridWidth: 400,
            viewMode,
          })}
          gridWidth={400}
          onPreviewOpen={vi.fn()}
          onToggleSelection={vi.fn()}
          selectedIds={new Set()}
          trashMode
          viewMode={viewMode}
          visibleItems={[item]}
        />
      );
    });

    const metadata = container?.querySelector<HTMLElement>(
      `[data-ui="gallery.${viewMode === 'compact-grid' ? 'compact' : 'large'}.metadata"]`
    );
    expect(metadata?.textContent).toContain('date:3');
    expect(metadata?.textContent).not.toContain('date:1');
    const icon = metadata?.querySelector('svg');
    expect(icon?.classList.toString()).toContain('lucide-trash');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.classList.toString()).toContain('h-3.5 w-3.5 shrink-0');
    expect(metadata?.className).toContain('text-[var(--sniptale-color-text-muted)]');
  }
);

it.each(['compact-grid', 'large-grid'] as const)(
  'shows the Trash date and aligned icon on deleted recording groups in %s',
  (viewMode) => {
    const item = createMediaItem({
      createdAt: 1,
      kind: 'recording',
      lifecycle: { savedAt: 1, storageClass: 'library', updatedAt: 2, trashedAt: 3 },
      recordingGroupView: {
        groupId: 'deleted-recording',
        memberCount: 2,
        order: 0,
        projectId: null,
        role: 'display',
        sourceLabel: 'Screen',
      },
    });

    act(() => {
      root?.render(
        <GalleryGridCanvas
          filteredItems={[item]}
          gridMetrics={createGridMetricsFixture({
            items: [item],
            columnCount: 1,
            gridWidth: 400,
            viewMode,
          })}
          gridWidth={400}
          onPreviewOpen={vi.fn()}
          onToggleSelection={vi.fn()}
          selectedIds={new Set()}
          trashMode
          viewMode={viewMode}
          visibleItems={[item]}
        />
      );
    });

    const metadata = container?.querySelector<HTMLElement>(
      `[data-ui="gallery.${viewMode === 'compact-grid' ? 'compact' : 'large'}.group-metadata"]`
    );
    expect(metadata?.textContent).toContain('date:3');
    expect(metadata?.textContent).not.toContain('date:1');
    const icon = metadata?.querySelector('svg');
    expect(icon?.classList.toString()).toContain('lucide-trash');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.classList.toString()).toContain('h-3.5 w-3.5 shrink-0');
    expect(metadata?.className).toContain('text-[var(--sniptale-color-text-muted)]');
  }
);
