import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useId, useState, type ReactNode } from 'react';
import {
  ChevronDown,
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
  'flex flex-col overflow-hidden rounded-[4px] border',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
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
        <details className="group/size">
          <summary
            className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-[4px] px-2
              [&::-webkit-details-marker]:hidden focus-visible:outline-2
            focus-visible:outline-[var(--sniptale-color-accent)]"
          >
            <span className="min-w-0 flex-1">
              {translate('gallery.app.trashTotalSize')}: {sizeText}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 transition-transform group-open/size:rotate-180
                motion-reduce:transition-none"
            />
          </summary>
          <p className="px-2 pt-2 text-sm leading-5 font-normal">
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
              <ProductActionButton
                tone="secondary"
                compact
                type="button"
                data-ui="gallery.sidebar.toggle"
                aria-label={toggleLabel}
                title={toggleLabel}
                aria-expanded={!compact}
                aria-controls={contentId}
                className="h-8 w-8 shrink-0"
                onClick={() => setCollapsed((value) => !value)}
              >
                {compact ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                )}
              </ProductActionButton>
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
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          disabled={props.busy}
          aria-describedby={props.trashMode ? undefined : sizeDescriptionId}
          className="w-full min-w-0 !justify-between [&>.sniptale-command-content]:w-full"
          aria-label={
            props.trashMode
              ? translate('gallery.app.returnToLibrary')
              : `${translate('gallery.app.trashTitle')}: ${countLabel}`
          }
          onClick={() => props.onTrashModeChange?.(!props.trashMode)}
        >
          <span
            className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-[13px]
            leading-[18px] font-medium"
          >
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
                className="max-w-24 shrink-0 truncate text-xs leading-4 font-normal tabular-nums
                    text-[var(--sniptale-color-text-secondary)]"
              >
                {compactCount}
              </span>
            </>
          ) : null}
        </ProductActionButton>
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
      <h2 className="text-sm leading-5 font-semibold">{translate('gallery.app.trashTitle')}</h2>
      <div
        data-ui="gallery.trash.summary"
        role="status"
        className="flex flex-col gap-1 text-[13px] leading-[18px] font-medium tabular-nums
          text-[var(--sniptale-color-text-secondary)]"
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
          <p className="text-[13px] leading-[18px]" role="status">
            {translate('gallery.app.selectedPrefix')}{' '}
            {formatNumber(props.selectedCount ?? 0, undefined, getCurrentLocale())}
          </p>
          {props.selectedCount ? (
            <ProductActionButton
              tone="secondary"
              compact
              data-command-chrome="true"
              type="button"
              aria-label={translate('gallery.app.trashDeselectAll')}
              title={translate('gallery.app.trashDeselectAll')}
              disabled={props.busy}
              className="sniptale-dismiss-button h-8 w-8 shrink-0"
              onClick={props.onClearSelection}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </ProductActionButton>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <ProductActionButton
            tone="secondary"
            compact
            type="button"
            disabled={
              props.busy ||
              !props.filteredItemCount ||
              (props.selectedCount ?? 0) >= props.filteredItemCount
            }
            className="w-full !justify-start"
            onClick={props.onSelectAll}
          >
            <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
            {translate('gallery.app.trashSelectAll')}
          </ProductActionButton>
          <ProductActionButton
            tone="secondary"
            compact
            type="button"
            disabled={props.busy || !props.selectedCount}
            className="w-full !justify-start"
            onClick={props.onRestoreTrash}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {translate('gallery.app.restoreTrash')}
          </ProductActionButton>
        </div>
        <div className="border-t border-[var(--sniptale-color-border-soft)] pt-2">
          <ProductActionButton
            tone="danger"
            compact
            type="button"
            disabled={props.busy || !props.selectedCount}
            className="w-full !justify-start"
            onClick={(event) =>
              props.onDeleteTrash?.({ anchor: event.currentTarget, keyboard: event.detail === 0 })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {translate('gallery.app.permanentDelete')}
          </ProductActionButton>
        </div>
      </div>
      <TrashRetentionControls {...trashRetention} />
      <div
        data-ui="gallery.trash.empty"
        className="border-t border-[var(--sniptale-color-border-soft)] pt-3"
      >
        <ProductActionButton
          tone="danger"
          compact
          type="button"
          disabled={props.busy || !props.trashSummary?.count}
          className="w-full !justify-start"
          onClick={(event) =>
            props.onEmptyTrash?.({ anchor: event.currentTarget, keyboard: event.detail === 0 })
          }
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {translate('gallery.app.emptyTrash')}
        </ProductActionButton>
      </div>
    </section>
  );
}
