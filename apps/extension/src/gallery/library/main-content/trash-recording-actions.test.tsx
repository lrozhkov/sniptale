// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support';
import { translate } from '../../../platform/i18n';

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: () => <div data-ui="test.thumb" />,
}));

import { GalleryGridCanvas, GalleryMediaList } from './grid-cards';

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

it.each(['large-grid', 'list'] as const)(
  'opens a deleted recording member without a dead group editor action in %s',
  (viewMode) => {
    const item = createMediaItem({
      id: 'deleted-recording',
      kind: 'recording',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
      recordingGroupView: {
        groupId: 'deleted-group',
        memberCount: 2,
        order: 0,
        projectId: 'deleted-project',
        role: 'display',
        sourceLabel: 'Screen',
      },
    });
    const onPreviewOpen = vi.fn();
    const onRecordingGroupOpen = vi.fn();
    const common = {
      filteredItems: [item],
      onPreviewOpen,
      onRecordingGroupOpen,
      onToggleSelection: vi.fn(),
      selectedIds: new Set<string>(),
      trashMode: true,
    };

    act(() => {
      root?.render(
        viewMode === 'list' ? (
          <GalleryMediaList {...common} />
        ) : (
          <GalleryGridCanvas
            {...common}
            gridMetrics={{ columnCount: 1, startRow: 0, totalRows: 1 }}
            gridWidth={400}
            viewMode={viewMode}
            visibleItems={[item]}
          />
        )
      );
    });

    expect(container?.textContent).not.toContain(
      translate('gallery.preview.openRecordingGroupShort')
    );
    const previewButton = container?.querySelector<HTMLButtonElement>(
      viewMode === 'list' ? 'button[title="capture.png"]' : 'button[aria-label^="Экран или окно:"]'
    );
    act(() => previewButton?.click());
    expect(onPreviewOpen).toHaveBeenCalledWith(item);
    expect(onRecordingGroupOpen).not.toHaveBeenCalled();
  }
);
