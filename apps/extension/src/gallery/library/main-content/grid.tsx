import type { Ref } from 'react';
import { translate } from '../../../platform/i18n';
import { GalleryEmptyState } from './empty-state';
import type { GalleryMainContentProps } from './types';
import { GalleryGridCanvas, GalleryMediaList } from './grid-cards';

function renderGalleryGridContent(
  props: Pick<
    GalleryMainContentProps,
    | 'filteredItems'
    | 'filteredScenarioProjects'
    | 'folderFilter'
    | 'gridMetrics'
    | 'gridWidth'
    | 'isLoading'
    | 'onPreviewOpen'
    | 'onScenarioPreviewOpen'
    | 'onToggleSelection'
    | 'selectedIds'
    | 'viewMode'
    | 'visibleItems'
  >
) {
  if (props.isLoading) {
    return (
      <div
        className={[
          'flex h-full min-h-[420px] items-center justify-center',
          'text-[var(--sniptale-color-text-secondary)]',
        ].join(' ')}
      >
        {translate('gallery.app.loading')}
      </div>
    );
  }

  if (props.filteredItems.length === 0) {
    return <GalleryEmptyState folderFilter={props.folderFilter} />;
  }

  return props.viewMode === 'list' ? (
    <GalleryMediaList {...props} />
  ) : (
    <GalleryGridCanvas {...props} />
  );
}

export function GalleryGrid(
  props: Pick<
    GalleryMainContentProps,
    | 'filteredItems'
    | 'filteredScenarioProjects'
    | 'folderFilter'
    | 'gridMetrics'
    | 'gridWidth'
    | 'gridViewportRef'
    | 'isLoading'
    | 'onPreviewOpen'
    | 'onScenarioPreviewOpen'
    | 'onToggleSelection'
    | 'selectedIds'
    | 'viewMode'
    | 'visibleItems'
  >
) {
  return (
    <div
      ref={props.gridViewportRef as Ref<HTMLDivElement>}
      className="mt-4 min-h-0 flex-1 overflow-auto rounded-[16px]
        border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)]
        p-4 shadow-sm"
    >
      {renderGalleryGridContent(props)}
    </div>
  );
}
