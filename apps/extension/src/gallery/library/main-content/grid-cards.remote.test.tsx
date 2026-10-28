// @vitest-environment jsdom
import { createRemoteRootGalleryItem } from '../items/adapters';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { createGridMetricsFixture } from '../test-support/items';

vi.mock('../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/format-bytes')>()),
  formatCompactBytes: (size: number) => `compact-size:${size}`,
  formatBytes: (size: number) => `size:${size}`,
}));

const thumbRenders = vi.hoisted(() => vi.fn());

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  MediaThumb: (props: {
    assetId?: string;
    deferUntilVisible?: boolean;
    fit?: string;
    item?: { id: string };
  }) => {
    thumbRenders(props.item?.id);
    return (
      <div
        data-fit={props.fit ?? 'cover'}
        data-deferred={String(props.deferUntilVisible ?? false)}
        data-ui="test.thumb"
      >
        {props.item?.id ?? props.assetId}
      </div>
    );
  },
  formatDate: (timestamp: number) => `date:${timestamp}`,
  getKindIcon: () => (props: { className?: string }) => <svg data-ui="test.icon" {...props} />,
}));

import { GalleryGridCanvas } from './grid-cards';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const metrics = (
  items: Parameters<typeof createGridMetricsFixture>[0]['items'],
  gridWidth: number,
  viewMode: 'compact-grid' | 'large-grid',
  columnCount: number
) => createGridMetricsFixture({ items, gridWidth, viewMode, columnCount });

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

it('renders a remote card with download admission and no local batch checkbox', () => {
  const item = createRemoteRootGalleryItem({
    source: 'remote',
    tags: [],
    label: 'Remote project',
    kind: 'image',
    mimeType: 'image/png',
    size: 100,
    createdAt: 1,
    updatedAt: 2,
    conflict: false,
    unavailable: false,
    deleted: false,
    selection: {
      rootKind: 'media',
      rootId: 'remote-root',
      operationId: 'operation-1',
      sourceDigest: 'a'.repeat(64),
    },
  });
  const onPreviewOpen = vi.fn();
  const onProjectOpen = vi.fn();
  act(() =>
    root?.render(
      <GalleryGridCanvas
        filteredItems={[item]}
        visibleItems={[item]}
        gridMetrics={metrics([item], 800, 'large-grid', 1)}
        gridWidth={800}
        onPreviewOpen={onPreviewOpen}
        onProjectOpen={onProjectOpen}
        onToggleSelection={vi.fn()}
        selectedIds={new Set()}
        viewMode="large-grid"
      />
    )
  );
  expect(container?.querySelector('[role="checkbox"]')).toBeNull();
  expect(container?.textContent).toContain(translate('gallery.app.remoteOnly'));
  const open = container?.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('gallery.app.remoteDownloadOpen')}"]`
  );
  expect(open?.disabled).toBe(false);
  act(() => open?.click());
  expect(onProjectOpen).toHaveBeenCalledWith(item);
});
