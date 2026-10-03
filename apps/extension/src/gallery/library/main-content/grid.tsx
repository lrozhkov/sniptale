import { GalleryThumbnailProvider } from '../ui/thumbnail-provider';
import { useGalleryGridKeyboard } from './use-grid-keyboard';
import type { GalleryCardNavigation } from './keyboard-navigation';
import type { Ref } from 'react';
import { translate } from '../../../platform/i18n';
import { GalleryEmptyState } from './empty-state';
import type { GalleryMainContentProps } from './types';
import { GalleryGridCanvas, GalleryMediaList } from './grid-cards';

function renderGalleryGridContent(
  props: Pick<
    GalleryMainContentProps,
    | 'trashMode'
    | 'trashItemCount'
    | 'filteredItems'
    | 'filteredScenarioProjects'
    | 'folderFilter'
    | 'gridMetrics'
    | 'gridWidth'
    | 'isLoading'
    | 'libraryEmpty'
    | 'onPreviewOpen'
    | 'onRecordingGroupOpen'
    | 'onProjectOpen'
    | 'onScenarioPreviewOpen'
    | 'onToggleSelection'
    | 'search'
    | 'selectedIds'
    | 'viewMode'
    | 'visibleItems'
  > & { navigation?: GalleryCardNavigation }
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
    return props.trashMode ? (
      <p role="status" className="p-4 text-sm">
        {translate(
          props.trashItemCount === 0 || !props.search.trim()
            ? 'gallery.app.trashEmpty'
            : 'gallery.app.trashNoResults'
        )}
      </p>
    ) : (
      <GalleryEmptyState folderFilter={props.folderFilter} libraryEmpty={props.libraryEmpty} />
    );
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
    | 'keyboardEnabled'
    | 'previewOpen'
    | 'navigationContext'
    | 'onSelectRange'
    | 'trashMode'
    | 'trashItemCount'
    | 'filteredItems'
    | 'filteredScenarioProjects'
    | 'folderFilter'
    | 'gridMetrics'
    | 'gridWidth'
    | 'gridViewportRef'
    | 'isLoading'
    | 'libraryEmpty'
    | 'onPreviewOpen'
    | 'onRecordingGroupOpen'
    | 'onProjectOpen'
    | 'onScenarioPreviewOpen'
    | 'onToggleSelection'
    | 'search'
    | 'selectedIds'
    | 'viewMode'
    | 'visibleItems'
  >
) {
  const keyboard = useGalleryGridKeyboard({
    ...props,
    keyboardEnabled: props.keyboardEnabled && !props.isLoading,
  });
  const activeMaterialRendered = props.visibleItems.some(
    (item) => item.id === keyboard.navigation.activeId
  );
  return (
    <div
      onKeyDown={keyboard.onKeyDown}
      aria-label={translate(props.trashMode ? 'gallery.app.trashTitle' : 'gallery.app.title')}
      ref={props.gridViewportRef as Ref<HTMLDivElement>}
      data-ui="gallery.content.surface"
      tabIndex={props.filteredItems.length === 0 || !activeMaterialRendered ? 0 : -1}
      className={[
        'min-h-0 flex-1 overflow-auto rounded-[var(--sniptale-radius-lg)]',
        'border border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)]',
        'shadow-sm',
        props.viewMode === 'list' ? 'p-0' : 'p-4',
      ].join(' ')}
    >
      <GalleryThumbnailProvider snapshot={props.filteredItems}>
        {renderGalleryGridContent({
          ...props,
          navigation: keyboard.navigation,
          onToggleSelection: keyboard.onPointerToggle,
        })}
      </GalleryThumbnailProvider>
    </div>
  );
}
