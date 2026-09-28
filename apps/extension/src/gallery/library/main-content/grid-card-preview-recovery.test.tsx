// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support/index';
import { translate } from '../../../platform/i18n';

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
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('offers recovery for an interrupted image presentation in grid and list views', () => {
  const item = createMediaItem({
    id: 'stale-image',
    filename: 'stale.png',
    presentationRevision: 1,
    workspaceRevision: 2,
  });

  for (const viewMode of ['large-grid', 'list'] as const) {
    const onProjectOpen = vi.fn();
    act(() => {
      root?.render(
        <GalleryGridCanvas
          filteredItems={[item]}
          gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
          gridWidth={400}
          onPreviewOpen={vi.fn()}
          onToggleSelection={vi.fn()}
          selectedIds={new Set()}
          onProjectOpen={onProjectOpen}
          viewMode={viewMode}
          visibleItems={[item]}
        />
      );
    });
    expect(container?.textContent).not.toContain(translate('gallery.app.updatingPreview'));
    const retry = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === translate('gallery.app.openEditorToRetryPreview')
    );
    expect(retry).toBeDefined();
    act(() => retry?.click());
    expect(onProjectOpen).toHaveBeenCalledWith(item);
  }
});

it('shows an unavailable preview without an editor retry action in Trash', () => {
  const item = createMediaItem({
    id: 'trashed-image',
    presentationRevision: 1,
    workspaceRevision: 2,
  });
  const onProjectOpen = vi.fn();
  for (const viewMode of ['large-grid', 'list'] as const) {
    act(() =>
      root?.render(
        viewMode === 'list' ? (
          <GalleryMediaList
            filteredItems={[item]}
            onPreviewOpen={vi.fn()}
            onProjectOpen={onProjectOpen}
            onToggleSelection={vi.fn()}
            selectedIds={new Set()}
            trashMode
          />
        ) : (
          <GalleryGridCanvas
            filteredItems={[item]}
            gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
            gridWidth={400}
            onPreviewOpen={vi.fn()}
            onProjectOpen={onProjectOpen}
            onToggleSelection={vi.fn()}
            selectedIds={new Set()}
            viewMode="large-grid"
            visibleItems={[item]}
            trashMode
          />
        )
      )
    );
    expect(container?.textContent).toContain(translate('gallery.app.previewUnavailable'));
    expect(container?.textContent).not.toContain(translate('gallery.app.openEditorToRetryPreview'));
    expect(onProjectOpen).not.toHaveBeenCalled();
  }
});
