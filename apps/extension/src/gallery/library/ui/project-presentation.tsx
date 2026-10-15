import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { formatDate } from './date';
import type { GalleryViewMode } from '../types';
import type { GalleryItem } from '../items';
import { canOpenGalleryProject } from '../items/types';
import { translate } from '../../../platform/i18n';
import { ArrowUpRight } from 'lucide-react';

const PROJECT_ACTION_CLASS_NAME =
  'gallery-project-open inline-flex items-center justify-start gap-1.5 text-left';

/** Concise project content and availability, without treating projects as encoded files. */
export function getGalleryProjectSummary(item: GalleryItem): string | null {
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
    return translate('gallery.preview.editableProject');
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
    props.item.type !== 'quick-edit-project'
  )
    return null;
  if (props.item.lifecycle?.trashedAt !== undefined) return null;
  const available = canOpenGalleryProject(props.item);
  const iconOnly = props.layout === 'grid';
  return (
    <ProductActionButton
      tone="secondary"
      compact
      data-command-chrome={iconOnly ? 'true' : undefined}
      type="button"
      disabled={!available}
      aria-label={iconOnly ? translate('gallery.preview.openInEditor') : undefined}
      title={
        available
          ? iconOnly
            ? translate('gallery.preview.openInEditor')
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
      {iconOnly ? (
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      ) : (
        translate('gallery.preview.openInEditor')
      )}
    </ProductActionButton>
  );
}

export function GalleryProjectDetails(props: {
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
    props.item.type === 'scenario' &&
    canOpenGalleryProject(props.item) &&
    props.item.lifecycle?.trashedAt === undefined
      ? formatDate(props.item.createdAt)
      : summary;
  return (
    <div
      className={
        isList
          ? 'min-w-0'
          : isCompact
            ? 'flex h-10 shrink-0 items-center gap-1 border-t border-[var(--sniptale-color-border-soft)] px-3 py-[3px]'
            : 'flex h-[72px] shrink-0 items-end gap-1 border-t border-[var(--sniptale-color-border-soft)] px-4 py-2'
      }
    >
      {!isList ? (
        <div className={`flex min-w-0 flex-1 flex-col ${isCompact ? 'gap-0.5' : 'gap-1'}`}>
          <button
            type="button"
            onClick={() => props.onPreviewOpen(props.item)}
            className={`text-[13px] leading-[18px]
              min-w-0 truncate text-left font-medium text-[var(--sniptale-color-text-primary)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]`}
            title={props.item.filename}
          >
            {props.item.filename}
          </button>
          <div
            className={`${isCompact ? 'text-[12px] leading-3' : 'text-[13px] leading-[18px]'}
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
        <GalleryProjectOpenAction
          item={props.item}
          onOpen={props.onOpen}
          layout={isList ? 'list' : 'grid'}
        />
      ) : null}
    </div>
  );
}
