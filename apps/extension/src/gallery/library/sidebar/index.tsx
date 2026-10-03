import { useId, useState, type ReactNode } from 'react';
import {
  Library,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { formatNumber, getCurrentLocale, translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';
import {
  getControlIconButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';
import type { GallerySidebarProps } from './types';
import type { GalleryTrashSummary } from '../types';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { GalleryFacetFilters, GalleryFolderList } from './sections';
import { TrashRetentionControls } from './trash-retention-controls';
import { useTrashRetentionPolicy } from './trash-retention-state';

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
  'flex min-h-10 min-w-0 w-full cursor-pointer flex-row items-center justify-between gap-2',
  'rounded-[var(--sniptale-radius-sm)] border border-[var(--sniptale-color-border-soft)]',
  'bg-transparent px-2 py-1.5 text-center transition-colors',
  'hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
  'focus-visible:ring-[var(--sniptale-color-accent)]',
  'disabled:cursor-not-allowed disabled:opacity-55',
].join(' ');

function GalleryTrashSummaryText({
  summary,
  compact = false,
}: {
  summary: GalleryTrashSummary | undefined;
  compact?: boolean;
}) {
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
      <span>
        {compact ? null : `${translate('gallery.app.trashSummaryCount')}: `}
        {formatNumber(summary?.count ?? 0, undefined, getCurrentLocale())}
      </span>
      {compact ? <span aria-hidden="true">·</span> : null}
      {compact ? (
        <span title={translate('gallery.app.trashSizeExplanation')}>{sizeText}</span>
      ) : (
        <details>
          <summary
            className="cursor-pointer rounded-[7px] focus-visible:outline-2
            focus-visible:outline-[var(--sniptale-color-accent)]"
          >
            {translate('gallery.app.trashTotalSize')}: {sizeText}
          </summary>
          <p className="pt-1 text-xs font-normal">
            {translate('gallery.app.trashSizeExplanation')}
          </p>
        </details>
      )}
    </>
  );
}

export function GallerySidebar(props: GallerySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const compact = collapsed && !props.trashMode;
  const contentId = useId();
  const toggleLabel = translate(
    compact ? 'gallery.app.sidebarExpand' : 'gallery.app.sidebarCollapse'
  );
  return (
    <InspectorShellFrame
      collapsed={compact}
      expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
      className="overflow-hidden border-r-0 bg-transparent"
      dataUi="gallery.sidebar.shell"
    >
      <InspectorShellPanel dataUi="gallery.sidebar.panel" className={gallerySidebarPanelClassName}>
        <div
          id={contentId}
          data-ui="gallery.sidebar.scroll"
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${compact ? 'p-1.5' : 'p-3'}`}
        >
          {props.trashMode ? (
            <GalleryTrashControls {...props} />
          ) : (
            <>
              <GalleryFolderList {...props} compact={compact} />
              <div hidden={compact}>
                {props.countsKnown ? <GalleryFacetFilters {...props} /> : null}
              </div>
            </>
          )}
        </div>
        <GallerySidebarFooter
          {...props}
          compact={compact}
          toggle={
            !props.trashMode ? (
              <button
                type="button"
                data-ui="gallery.sidebar.toggle"
                aria-label={toggleLabel}
                title={toggleLabel}
                aria-expanded={!compact}
                aria-controls={contentId}
                className={`${getControlIconButtonClassName()} !h-10 shrink-0`}
                onClick={() => setCollapsed((value) => !value)}
              >
                {compact ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            ) : null
          }
        />
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}

function getTrashCountPresentation(
  props: Pick<GallerySidebarProps, 'countsKnown' | 'trashSummary'>
) {
  const count = props.trashSummary?.count ?? 0;
  const fullCount = formatNumber(count, undefined, getCurrentLocale());
  const countLabel = props.countsKnown ? fullCount : translate('gallery.app.trashCountLoading');
  const compactCount = props.countsKnown
    ? formatNumber(
        count,
        count >= 1000 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined,
        getCurrentLocale()
      )
    : countLabel;
  return { countLabel, compactCount };
}

function GallerySidebarFooter(
  props: Pick<
    GallerySidebarProps,
    'busy' | 'trashMode' | 'countsKnown' | 'trashSummary' | 'onTrashModeChange'
  > & { compact?: boolean; toggle?: ReactNode }
) {
  const sizeDescriptionId = useId();
  const { countLabel, compactCount } = getTrashCountPresentation(props);
  return (
    <div
      data-ui="gallery.sidebar.footer"
      className="flex shrink-0 items-center gap-2 border-t border-[var(--sniptale-color-border-soft)] p-2.5"
    >
      <div hidden={props.compact} className="min-w-0 flex-1">
        <button
          type="button"
          disabled={props.busy}
          aria-describedby={props.trashMode ? undefined : sizeDescriptionId}
          className={trashButtonClassName}
          aria-label={
            props.trashMode
              ? translate('gallery.app.returnToLibrary')
              : `${translate('gallery.app.trashTitle')}: ${countLabel}`
          }
          onClick={() => props.onTrashModeChange?.(!props.trashMode)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-sm font-semibold">
            {props.trashMode ? (
              <Library className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {translate(
                props.trashMode ? 'gallery.app.returnToLibrary' : 'gallery.app.trashTitle'
              )}
            </span>
          </span>
          {!props.trashMode ? (
            <>
              <span
                data-ui="gallery.trash.footerCount"
                title={countLabel}
                aria-hidden="true"
                className="max-w-24 shrink-0 truncate rounded-full border
                    border-[var(--sniptale-color-border-soft)] px-2 py-0.5
                    text-[11px] font-semibold tabular-nums
                    text-[var(--sniptale-color-text-secondary)]"
              >
                {compactCount}
              </span>
            </>
          ) : null}
        </button>
      </div>
      {props.toggle}
      <span id={sizeDescriptionId} data-ui="gallery.trash.footerSummary" className="sr-only">
        {translate('gallery.app.trashSizeExplanation')}
        {props.countsKnown ? (
          <GalleryTrashSummaryText summary={props.trashSummary} compact />
        ) : null}
      </span>
    </div>
  );
}

function GalleryTrashControls(props: GallerySidebarProps) {
  const trashRetention = useTrashRetentionPolicy();
  return (
    <section className="flex flex-col gap-4 pb-3" aria-label={translate('gallery.app.trashTitle')}>
      <h2 className="text-sm font-semibold">{translate('gallery.app.trashTitle')}</h2>
      <div
        data-ui="gallery.trash.summary"
        role="status"
        className="flex flex-col gap-1 text-sm font-medium tabular-nums text-[var(--sniptale-color-text-secondary)]"
      >
        {props.countsKnown ? (
          <GalleryTrashSummaryText summary={props.trashSummary} />
        ) : (
          translate('gallery.app.trashCountLoading')
        )}
      </div>
      <div
        data-ui="gallery.trash.selection"
        className="space-y-2 border-t border-[var(--sniptale-color-border-soft)] pt-3"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm" role="status">
            {translate('gallery.app.selectedPrefix')}{' '}
            {formatNumber(props.selectedCount ?? 0, undefined, getCurrentLocale())}
          </p>
          {props.selectedCount ? (
            <button
              type="button"
              aria-label={translate('gallery.app.trashDeselectAll')}
              title={translate('gallery.app.trashDeselectAll')}
              disabled={props.busy}
              className={getControlIconButtonClassName({ density: 'compact' })}
              onClick={props.onClearSelection}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={
              props.busy ||
              !props.filteredItemCount ||
              (props.selectedCount ?? 0) >= props.filteredItemCount
            }
            className={`${getControlSecondaryButtonClassName({ density: 'compact' })} w-full !justify-start`}
            onClick={props.onSelectAll}
          >
            <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
            {translate('gallery.app.trashSelectAll')}
          </button>
          <button
            type="button"
            disabled={props.busy || !props.selectedCount}
            className={`${getControlSecondaryButtonClassName({ density: 'compact' })} w-full !justify-start`}
            onClick={props.onRestoreTrash}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {translate('gallery.app.restoreTrash')}
          </button>
        </div>
        <div className="border-t border-[var(--sniptale-color-border-soft)] pt-2">
          <button
            type="button"
            disabled={props.busy || !props.selectedCount}
            className={`${getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' })}
            w-full !justify-start`}
            onClick={(event) =>
              props.onDeleteTrash?.({ anchor: event.currentTarget, keyboard: event.detail === 0 })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {translate('gallery.app.permanentDelete')}
          </button>
        </div>
      </div>
      <TrashRetentionControls {...trashRetention} />
      <div
        data-ui="gallery.trash.empty"
        className="border-t border-[var(--sniptale-color-border-soft)] pt-3"
      >
        <button
          type="button"
          disabled={props.busy || !props.trashSummary?.count}
          className={`${getControlSecondaryButtonClassName({ density: 'compact', tone: 'danger' })}
            w-full !justify-start`}
          onClick={(event) =>
            props.onEmptyTrash?.({ anchor: event.currentTarget, keyboard: event.detail === 0 })
          }
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {translate('gallery.app.emptyTrash')}
        </button>
      </div>
    </section>
  );
}
