import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import type { GallerySidebarProps } from './types';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { GalleryFacetFilters, GalleryFolderList } from './sections';

const gallerySidebarPanelClassName = [
  [
    'flex flex-col overflow-hidden',
    'rounded-[var(--sniptale-radius-lg)] border',
    'border-[var(--sniptale-color-border-soft)] shadow-sm',
  ].join(' '),
  [
    'bg-[linear-gradient(',
    '180deg,',
    'color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)_0%,',
    'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_80%,transparent)_100%',
    ')]',
  ].join(' '),
].join(' ');

export function GallerySidebar(props: GallerySidebarProps) {
  return (
    <InspectorShellFrame
      expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
      className="overflow-hidden border-r-0 bg-transparent"
      dataUi="gallery.sidebar.shell"
    >
      <InspectorShellPanel dataUi="gallery.sidebar.panel" className={gallerySidebarPanelClassName}>
        <div
          data-ui="gallery.sidebar.scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        >
          {props.trashMode ? (
            <GalleryTrashControls {...props} />
          ) : (
            <>
              <GalleryFolderList {...props} />
              <GalleryFacetFilters {...props} />
            </>
          )}
        </div>
        <div
          data-ui="gallery.sidebar.footer"
          className="flex shrink-0 border-t border-[var(--sniptale-color-border-soft)] p-2.5"
        >
          <button
            type="button"
            disabled={props.busy}
            className={`${getControlSecondaryButtonClassName({ density: 'compact' })} max-w-full`}
            onClick={() => props.onTrashModeChange?.(!props.trashMode)}
          >
            {props.trashMode ? (
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            {translate(props.trashMode ? 'gallery.app.returnToLibrary' : 'gallery.app.trashTitle')}
          </button>
        </div>
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}

function GalleryTrashControls(props: GallerySidebarProps) {
  return (
    <section className="flex flex-col gap-3 pb-6" aria-label={translate('gallery.app.trashTitle')}>
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.app.trashDescription')}
      </p>
      <p className="text-sm" role="status">
        {translate('gallery.app.selectedPrefix')} {props.selectedCount ?? 0}
      </p>
      <button
        type="button"
        disabled={props.busy || !props.filteredItemCount}
        className={getControlSecondaryButtonClassName({ density: 'compact' })}
        onClick={props.onSelectAll}
      >
        {translate('gallery.app.trashSelectAll')}
      </button>
      <button
        type="button"
        disabled={props.busy || !props.selectedCount}
        className={getControlSecondaryButtonClassName({ density: 'compact' })}
        onClick={props.onRestoreTrash}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {translate('gallery.app.restoreTrash')}
      </button>
      <div className="mt-3 flex flex-col gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-3">
        <button
          type="button"
          disabled={props.busy || !props.selectedCount}
          className={getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' })}
          onClick={props.onDeleteTrash}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {translate('gallery.app.permanentDelete')}
        </button>
        <button
          type="button"
          disabled={props.busy || !props.filteredItemCount}
          className={getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' })}
          onClick={props.onEmptyTrash}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {translate('gallery.app.emptyTrash')}
        </button>
      </div>
    </section>
  );
}
