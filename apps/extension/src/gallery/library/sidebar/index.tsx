import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { formatNumber, getCurrentLocale, translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';
import type { GallerySidebarProps } from './types';
import type { GalleryTrashSummary } from '../types';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { GalleryFacetFilters, GalleryFolderList } from './sections';
import { TrashRetentionControls } from './trash-retention-controls';
import { useTrashRetentionPolicy } from '../../state/useTrashRetentionPolicy';

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

const trashButtonClassName = [
  'flex min-h-14 min-w-0 w-full cursor-pointer flex-col items-center justify-center gap-1',
  'rounded-[var(--sniptale-radius-sm)] border border-[var(--sniptale-color-border-soft)]',
  'bg-transparent px-2 py-2 text-center transition-colors',
  'hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
  'focus-visible:ring-[var(--sniptale-color-accent)]',
  'disabled:cursor-not-allowed disabled:opacity-55',
].join(' ');

function GalleryTrashSummaryText({ summary }: { summary: GalleryTrashSummary | undefined }) {
  const size = summary?.size;
  const sizeText =
    size?.status === 'ready'
      ? formatBytes(size.bytes)
      : translate(
          size?.status === 'unavailable'
            ? 'gallery.app.trashSizeUnavailable'
            : 'gallery.app.trashSizeLoading'
        );

  return (
    <>
      {translate('gallery.app.trashSummaryCount')}:{' '}
      {formatNumber(summary?.count ?? 0, undefined, getCurrentLocale())}
      <span aria-hidden="true"> · </span>
      {sizeText}
    </>
  );
}

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
            className={trashButtonClassName}
            onClick={() => props.onTrashModeChange?.(!props.trashMode)}
          >
            <span className="flex min-w-0 items-center justify-center gap-2 text-xs font-semibold">
              {props.trashMode ? (
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {translate(
                props.trashMode ? 'gallery.app.returnToLibrary' : 'gallery.app.trashTitle'
              )}
            </span>
            {!props.trashMode ? (
              <span className="max-w-full truncate text-[11px] text-[var(--sniptale-color-text-secondary)]">
                <GalleryTrashSummaryText summary={props.trashSummary} />
              </span>
            ) : null}
          </button>
        </div>
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}

function GalleryTrashControls(props: GallerySidebarProps) {
  const trashRetention = useTrashRetentionPolicy();
  return (
    <section className="flex flex-col gap-3 pb-6" aria-label={translate('gallery.app.trashTitle')}>
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
      <p
        data-ui="gallery.trash.summary"
        role="status"
        className="text-xs text-[var(--sniptale-color-text-secondary)]"
      >
        <GalleryTrashSummaryText summary={props.trashSummary} />
      </p>
      <TrashRetentionControls {...trashRetention} />
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
          disabled={props.busy || !props.trashSummary?.count}
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
