import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { formatDate } from './date';
import type { GalleryViewMode } from '../types';
import { isGalleryRemoteItem, type GalleryItem } from '../items';
import { canOpenGalleryProject } from '../items/types';
import { translate } from '../../../platform/i18n';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

const PROJECT_ACTION_CLASS_NAME =
  'gallery-project-open inline-flex items-center justify-start gap-1.5 text-left';

/** Concise project content and availability, without treating projects as encoded files. */
export function getGalleryProjectSummary(item: GalleryItem): string | null {
  if (isGalleryRemoteItem(item)) {
    if (item.remote.conflict) return translate('gallery.app.remoteConflict');
    if (item.remote.unavailable || item.remote.deleted)
      return translate('gallery.app.remoteUnavailable');
    return translate('gallery.app.remoteOnly');
  }
  if (
    item.type !== 'scenario' &&
    item.type !== 'video-project' &&
    item.type !== 'quick-edit-project'
  )
    return null;
  if (item.lifecycle?.trashedAt !== undefined)
    return translate('gallery.preview.restoreProjectFirst');
  if (!canOpenGalleryProject(item)) return translate('gallery.preview.projectUnavailable');
  if (item.type === 'scenario' || item.type === 'quick-edit-project')
    return formatDate(item.createdAt);
  return [
    `${translate('gallery.preview.clips')}: ${item.project.clipCount}`,
    `${translate('gallery.preview.tracks')}: ${item.project.trackCount}`,
    `${item.duration.toFixed(1)} ${translate('gallery.preview.durationSuffix')}`,
  ].join(' · ');
}

export function GalleryProjectOpenAction(props: {
  item: GalleryItem;
  layout?: 'grid' | 'list';
  onOpen: (item: GalleryItem) => void;
}) {
  if (
    props.item.type !== 'scenario' &&
    props.item.type !== 'video-project' &&
    props.item.type !== 'quick-edit-project' &&
    !isGalleryRemoteItem(props.item)
  )
    return null;
  if (props.item.lifecycle?.trashedAt !== undefined) return null;
  const available = canOpenGalleryProject(props.item);
  const iconOnly = props.layout === 'grid';
  const openLabel = translate(
    isGalleryRemoteItem(props.item)
      ? 'gallery.app.remoteDownloadOpen'
      : 'gallery.preview.openInEditor'
  );
  return (
    <ProductActionButton
      tone="secondary"
      compact
      data-command-chrome={iconOnly ? 'true' : undefined}
      type="button"
      disabled={!available}
      aria-label={iconOnly ? openLabel : undefined}
      title={
        available
          ? iconOnly
            ? openLabel
            : props.item.filename
          : translate('gallery.preview.projectUnavailable')
      }
      onClick={() => props.onOpen(props.item)}
      className={
        iconOnly
          ? `flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--sniptale-radius-md)]
            text-[var(--sniptale-color-text-secondary)] transition-colors
            hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]
            disabled:cursor-not-allowed disabled:opacity-50`
          : `${PROJECT_ACTION_CLASS_NAME} ${props.layout === 'list' ? 'w-full max-w-[180px]' : 'w-full'}`
      }
    >
      {iconOnly ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : openLabel}
    </ProductActionButton>
  );
}

export function GalleryProjectDetails(props: {
  leading?: ReactNode;
  item: GalleryItem;
  viewMode: GalleryViewMode;
  onPreviewOpen: (item: GalleryItem) => void;
  onOpen?: (item: GalleryItem) => void;
}) {
  const summary = getGalleryProjectSummary(props.item);
  if (!summary) return null;
  const isList = props.viewMode === 'list';
  const isCompact = props.viewMode === 'compact-grid';
  const gridSummary =
    canOpenGalleryProject(props.item) &&
    props.item.lifecycle?.trashedAt === undefined &&
    !isGalleryRemoteItem(props.item)
      ? formatDate(props.item.createdAt)
      : summary;
  return (
    <div
      data-ui={isList ? undefined : 'gallery.project.details'}
      className={
        isList
          ? 'min-w-0'
          : isCompact
            ? `group/gallery-caption relative flex h-10 shrink-0 items-center gap-1 border-t
              border-[var(--sniptale-color-border-soft)] pl-11 pr-2 py-[3px]`
            : `group/gallery-caption relative grid h-[72px] shrink-0 content-center
              grid-cols-[32px_minmax(0,1fr)_auto] grid-rows-[24px_16px] gap-x-2 gap-y-1 border-t
              border-[var(--sniptale-color-border-soft)] px-3`
      }
    >
      {!isList ? (
        <span
          className={`flex h-8 w-8 items-center justify-center
          ${isCompact ? 'absolute bottom-1 left-1' : 'relative col-start-1 row-start-1 self-center'}`}
        >
          {props.leading}
        </span>
      ) : null}
      {!isList ? (
        <div className={`${isCompact ? 'flex min-w-0 flex-1 flex-col gap-0.5' : 'contents'}`}>
          <button
            type="button"
            onClick={() => props.onPreviewOpen(props.item)}
            className={`text-[13px] ${isCompact ? 'leading-[18px]' : 'col-start-2 row-start-1 h-6 leading-6'}
              min-w-0 truncate text-left font-medium text-[var(--sniptale-color-text-primary)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]`}
            title={props.item.filename}
          >
            {props.item.filename}
          </button>
          <div
            className={`${isCompact ? 'text-[12px] leading-3' : 'col-start-2 col-span-2 row-start-2 text-xs leading-4'}
              truncate text-[var(--sniptale-color-text-secondary)]`}
            title={gridSummary}
          >
            {gridSummary}
          </div>
        </div>
      ) : null}
      {isList ? (
        <div className="min-w-0 flex-1 text-xs text-[var(--sniptale-color-text-secondary)]">
          <div className="truncate" title={summary}>
            {summary}
          </div>
        </div>
      ) : null}
      {props.onOpen ? (
        <div
          className={
            isList || isCompact
              ? 'contents'
              : 'col-start-3 row-start-1 flex items-center justify-end'
          }
        >
          <GalleryProjectOpenAction
            item={props.item}
            onOpen={props.onOpen}
            layout={isList ? 'list' : 'grid'}
          />
        </div>
      ) : null}
    </div>
  );
}
